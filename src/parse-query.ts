import {
  execute,
  getOperationAST,
  parse,
  Source,
  specifiedRules,
  validate,
  validateSchema
} from "graphql";
import httpError from "http-errors";

import { GraphQLParams } from "./graphql-param";
import { OptionsData } from "./option";

import type { Context } from "koa";
import type { DocumentNode, ExecutionResult } from "graphql";

type Result = { result: ExecutionResult; document?: DocumentNode };

export const parseQuery = async (
  data: OptionsData,
  params: GraphQLParams,
  ctx: Context
): Promise<Result> => {
  const { query, variables, operationName } = params;
  const { request, response } = ctx;
  const { rootValue, schema, validationRules = [], fieldResolver } = data;

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
    return { result: { errors: schemaValidationErrors } };
  }
  // GraphQL source.
  const source = new Source(query, "GraphQL request");

  let document: DocumentNode;
  // Parse source to AST, reporting any syntax error.
  try {
    document = parse(source);
  } catch (syntaxError) {
    // Return 400: Bad Request if any syntax errors errors exist.
    response.status = 400;
    return { result: { errors: [syntaxError] } };
  }

  const rules = specifiedRules.concat(validationRules);

  // Validate AST, reporting any errors.
  const validationErrors = validate(schema, document, rules);
  if (validationErrors.length > 0) {
    // Return 400: Bad Request if any validation errors exist.
    response.status = 400;
    return { result: { errors: validationErrors } };
  }

  // Only query operations are allowed on GET requests.
  if (request.method === "GET") {
    // Determine if this GET request will perform a non-query.
    const operationAST = getOperationAST(document, operationName);
    if (operationAST && operationAST.operation !== "query") {
      // Otherwise, report a 405: Method Not Allowed error.
      response.set("Allow", "POST");
      throw httpError(
        405,
        `Can only perform a ${operationAST.operation} operation from a POST request.`
      );
    }
  }

  // Perform the execution, reporting any errors creating the context.
  try {
    const result = await execute(
      schema,
      document,
      rootValue,
      ctx,
      variables,
      operationName,
      fieldResolver
    );
    response.status = 200;
    return { result, document };
  } catch (contextError) {
    // Return 400: Bad Request if any execution context errors exist.
    response.status = 400;
    return { result: { errors: [contextError] } };
  }
};
