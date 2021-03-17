import type { IncomingMessage } from "http";
import { URLSearchParams } from "url";
import httpError from "http-errors";

import { parseBody } from "./parse-body";

export interface GraphQLParams {
  query: string | null;
  variables: { readonly [name: string]: unknown } | null;
  operationName: string | null;
  raw: boolean;
}

export async function getGraphQLParams(
  request: IncomingMessage,
  body?: unknown
): Promise<GraphQLParams> {
  const urlData = new URLSearchParams(request.url?.split("?")[1]);
  const bodyData = await parseBody(request, body);

  // GraphQL Query string.
  let query = urlData.get("query") ?? (bodyData.query as string | null);
  if (typeof query !== "string") {
    query = null;
  }

  // Parse the variables if needed.
  let variables = (urlData.get("variables") ?? bodyData.variables) as {
    readonly [name: string]: unknown;
  } | null;
  if (typeof variables === "string") {
    try {
      variables = JSON.parse(variables);
    } catch {
      throw httpError(400, "Variables are invalid JSON.");
    }
  } else if (typeof variables !== "object") {
    variables = null;
  }

  // Name of GraphQL operation to execute.
  let operationName =
    urlData.get("operationName") ?? (bodyData.operationName as string | null);
  if (typeof operationName !== "string") {
    operationName = null;
  }

  const raw = urlData.get("raw") !== null || bodyData.raw !== undefined;

  return { query, variables, operationName, raw };
}
