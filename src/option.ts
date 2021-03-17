import type { Context, Request, Response } from "koa";
import type {
  ASTVisitor,
  GraphQLError,
  GraphQLFieldResolver,
  GraphQLSchema,
  ValidationContext
} from "graphql";

import type { MayBePromise, RequestInfo } from "./type";

export type Options =
  | ((request: Request, response: Response, context: Context) => OptionsResult)
  | OptionsResult;
export type OptionsResult = OptionsData | Promise<OptionsData>;
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
  extensions?: (info: RequestInfo) => MayBePromise<{ [key: string]: any }>;

  /**
   * A resolver function to use when one is not provided by the schema.
   * If not provided, the default field resolver is used (which looks for a
   * value or method on the source value with the field's name).
   */
  fieldResolver?: GraphQLFieldResolver<any, any>;
};

export const parseOptions = async (
  opts: Options,
  ctx: Context
): Promise<OptionsData> => {
  const { request, response } = ctx;
  // Resolve the Options to get OptionsData.
  const optionsData = await (typeof opts === "function"
    ? opts(request, response, ctx)
    : opts);

  // Assert that optionsData is in fact an Object.
  if (!optionsData || typeof optionsData !== "object") {
    throw new Error(
      "GraphQL middleware option function must return an options object " +
        "or a promise which will be resolved to an options object."
    );
  }
  return optionsData;
};
