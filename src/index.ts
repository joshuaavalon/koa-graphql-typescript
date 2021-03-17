import { formatError } from "graphql";
import httpError from "http-errors";

import { getGraphQLParams } from "./graphql-param";
import { Options, parseOptions } from "./option";
import { parseQuery } from "./parse-query";

import type { Middleware } from "koa";
import type { ExecutionResult } from "graphql";

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

    const data = await parseOptions(options, ctx);
    const {
      schema,
      formatError: formatErrorFn,
      extensions: extensionsFn,
      pretty
    } = data;

    // Assert that schema is required.
    if (!schema) {
      throw new Error("GraphQL middleware options must contain a schema.");
    }

    let result: ExecutionResult;
    try {
      // Parse the Request to get GraphQL request parameters.
      const params = await getGraphQLParams(req, body);
      const { variables, operationName } = params;

      const query = await parseQuery(data, params, ctx);
      result = query.result;

      // Collect and apply any metadata extensions if a function was provided.
      // http://facebook.github.io/graphql/#sec-Response-Format
      if (result && extensionsFn) {
        const extensions = extensionsFn({
          document: query.document,
          variables,
          operationName,
          result,
          context: ctx
        });
        if (extensions && typeof extensions === "object") {
          result.extensions = extensions;
        }
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
