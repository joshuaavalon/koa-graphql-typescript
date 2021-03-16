import {
  DocumentNode,
  execute,
  formatError,
  getOperationAST,
  parse,
  Source,
  specifiedRules,
  validate,
  validateSchema
} from "graphql";
import httpError from "http-errors";
import { getGraphQLParams, Request as ParseRequest } from "./parseBody";

import type {
  ASTVisitor,
  FormattedExecutionResult,
  GraphQLError,
  GraphQLFieldResolver,
  GraphQLSchema,
  ValidationContext
} from "graphql";
import type { Context, Middleware, Request, Response } from "koa";

export type Options =
  | ((request: Request, response: Response, ctx: Context) => OptionsResult)
  | OptionsResult;
export type OptionsResult = OptionsData | Promise<OptionsData>;
/**
 * All information about a GraphQL request.
 */
export interface RequestInfo {
  /**
   * The parsed GraphQL document.
   */
  document: DocumentNode;

  /**
   * The variable values used at runtime.
   */
  variables: { readonly [name: string]: unknown } | null;

  /**
   * The (optional) operation name requested.
   */
  operationName: string | null;

  /**
   * The result of executing the operation.
   */
  result: FormattedExecutionResult;

  /**
   * A value to pass as the context to the graphql() function.
   */
  context?: unknown;
}
export type OptionsData = {
  /**
   * A GraphQL schema from graphql-js.
   */
  schema: GraphQLSchema;

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: any;

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: boolean;

  /**
   * An optional function which will be used to format any errors produced by
   * fulfilling a GraphQL operation. If no function is provided, GraphQL's
   * default spec-compliant `formatError` function will be used.
   */
  formatError?: (error: GraphQLError, context?: Context) => any;

  /**
   * An optional array of validation rules that will be applied on the document
   * in additional to those defined by the GraphQL spec.
   */
  validationRules?: Array<(ctx: ValidationContext) => ASTVisitor>;

  /**
   * An optional function for adding additional metadata to the GraphQL response
   * as a key-value object. The result will be added to "extensions" field in
   * the resulting JSON. This is often a useful place to add development time
   * info such as the runtime of a query or the amount of resources consumed.
   *
   * Information about the request is provided to be used.
   *
   * This function may be async.
   */
  extensions?: (info: RequestInfo) => { [key: string]: any };

  /**
   * A resolver function to use when one is not provided by the schema.
   * If not provided, the default field resolver is used (which looks for a
   * value or method on the source value with the field's name).
   */
  fieldResolver?: GraphQLFieldResolver<any, any>;
};

type Result = ReturnType<typeof execute>;
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

export const graphqlHTTP = (options: Options): Middleware => {
  if (!options) {
    throw new Error("GraphQL middleware requires options.");
  }
  return async (ctx, next) => {
    const { request, response, req, body } = ctx;

    // GraphQL HTTP only supports GET and POST methods.
    if (request.method !== "GET" && request.method !== "POST") {
      response.set("Allow", "GET, POST");
      throw httpError(405, "GraphQL only supports GET and POST requests.");
    }

    // Resolve the Options to get OptionsData.
    const optionsData = await (typeof options === "function"
      ? options(request, response, ctx)
      : options);

    // Assert that optionsData is in fact an Object.
    if (!optionsData || typeof optionsData !== "object") {
      throw new Error(
        "GraphQL middleware option function must return an options object " +
          "or a promise which will be resolved to an options object."
      );
    }
    const {
      schema,
      rootValue,
      fieldResolver,
      formatError: formatErrorFn,
      extensions: extensionsFn,
      validationRules = [],
      pretty
    } = optionsData;
    // Assert that schema is required.
    if (!schema) {
      throw new Error("GraphQL middleware options must contain a schema.");
    }

    let result: Awaited<Result>;
    try {
      const rules = specifiedRules.concat(validationRules);
      const parseRequest: ParseRequest = req;
      parseRequest.body = body;

      // Parse the Request to get GraphQL request parameters.
      const { query, variables, operationName } = await getGraphQLParams(
        parseRequest
      );

      let documentAST: DocumentNode;
      result = await new Promise<Result>((resolve): void => {
        // If there is no query, but GraphiQL will be displayed, do not produce
        // a result, otherwise return a 400: Bad Request.
        if (!query) {
          throw httpError(400, "Must provide query string.");
        }

        // Validate Schema
        const schemaValidationErrors = validateSchema(schema);
        if (schemaValidationErrors.length > 0) {
          // Return 500: Internal Server Error if invalid schema.
          response.status = 500;
          resolve({ errors: schemaValidationErrors });
          return;
        }

        // GraphQL source.
        const source = new Source(query, "GraphQL request");

        // Parse source to AST, reporting any syntax error.
        try {
          documentAST = parse(source);
        } catch (syntaxError) {
          // Return 400: Bad Request if any syntax errors errors exist.
          response.status = 400;
          resolve({ errors: [syntaxError] });
          return;
        }

        // Validate AST, reporting any errors.
        const validationErrors = validate(schema, documentAST, rules);
        if (validationErrors.length > 0) {
          // Return 400: Bad Request if any validation errors exist.
          response.status = 400;
          resolve({ errors: validationErrors });
          return;
        }

        // Only query operations are allowed on GET requests.
        if (request.method === "GET") {
          // Determine if this GET request will perform a non-query.
          const operationAST = getOperationAST(documentAST, operationName);
          if (operationAST && operationAST.operation !== "query") {
            // Otherwise, report a 405: Method Not Allowed error.
            response.set("Allow", "POST");
            throw httpError(
              405,
              `Can only perform a ${operationAST.operation} operation ` +
                "from a POST request."
            );
          }
        }

        // Perform the execution, reporting any errors creating the context.
        try {
          resolve(
            execute(
              schema,
              documentAST,
              rootValue,
              ctx,
              variables,
              operationName,
              fieldResolver
            )
          );
          response.status = 200;
        } catch (contextError) {
          // Return 400: Bad Request if any execution context errors exist.
          response.status = 400;
          resolve({ errors: [contextError] });
        }
      });

      // Collect and apply any metadata extensions if a function was provided.
      // http://facebook.github.io/graphql/#sec-Response-Format
      if (result && extensionsFn) {
        result = await Promise.resolve(
          extensionsFn({
            document: documentAST as any,
            variables,
            operationName,
            result,
            context: ctx
          })
        ).then(extensions => {
          if (extensions && typeof extensions === "object") {
            result.extensions = extensions;
          }
          return result;
        });
      }
    } catch (error) {
      // If an error was caught, report the httpError status, or 500.
      response.status = error.status || 500;
      result = { errors: [error] };
    }

    // If no data was included in the result, that indicates a runtime query
    // error, indicate as such with a generic status code.
    // Note: Information about the error itself will still be contained in
    // the resulting JSON payload.
    // http://facebook.github.io/graphql/#sec-Data
    if (response.status === 200 && result && !result.data) {
      response.status = 500;
    }
    // Format any encountered errors.
    if (result && result.errors) {
      result.errors = result.errors.map(err =>
        formatErrorFn ? formatErrorFn(err, ctx) : formatError(err)
      );
    }

    // Otherwise, present JSON directly.
    const payload = pretty ? JSON.stringify(result, null, 2) : result;
    response.type = "application/json";
    response.body = payload;
    await next();
  };
};
