import type { IncomingMessage } from "http";
import type { Gunzip, Inflate } from "zlib";
import zlib from "zlib";
import querystring from "querystring";
import { URLSearchParams } from "url";
import getBody from "raw-body";
import httpError from "http-errors";
import contentType from "content-type";

import type { ParsedMediaType } from "content-type";

export interface GraphQLParams {
  query: string | null;
  variables: { readonly [name: string]: unknown } | null;
  operationName: string | null;
  raw: boolean;
}

export type Request = IncomingMessage & { body?: unknown };

// Return a decompressed stream, given an encoding.
function decompressed(
  req: Request,
  encoding: string
): Request | Inflate | Gunzip {
  switch (encoding) {
    case "identity":
      return req;
    case "deflate":
      return req.pipe(zlib.createInflate());
    case "gzip":
      return req.pipe(zlib.createGunzip());
  }
  throw httpError(415, `Unsupported content-encoding "${encoding}".`);
}

/**
 * RegExp to match an Object-opening brace "{" as the first non-space
 * in a string. Allowed whitespace is defined in RFC 7159:
 *
 *     ' '   Space
 *     '\t'  Horizontal tab
 *     '\n'  Line feed or New line
 *     '\r'  Carriage return
 */
const jsonObjRegex = /^[ \t\n\r]*\{/u;

// Read and parse a request body.
async function readBody(
  req: Request,
  typeInfo: ParsedMediaType
): Promise<string> {
  const charset = typeInfo.parameters.charset?.toLowerCase() ?? "utf-8";

  // Assert charset encoding per JSON RFC 7159 sec 8.1
  if (!charset.startsWith("utf-")) {
    throw httpError(415, `Unsupported charset "${charset.toUpperCase()}".`);
  }

  // Get content-encoding (e.g. gzip)
  const contentEncoding = req.headers["content-encoding"];
  const encoding =
    typeof contentEncoding === "string"
      ? contentEncoding.toLowerCase()
      : "identity";
  const length = encoding === "identity" ? req.headers["content-length"] : null;
  const limit = 100 * 1024; // 100kb
  const stream = decompressed(req, encoding);

  // Read body from stream.
  try {
    return await getBody(stream, { encoding: charset, length, limit });
  } catch (rawError: unknown) {
    const error = httpError(
      400,
      /* istanbul ignore next: Thrown by underlying library. */
      rawError instanceof Error ? rawError : String(rawError)
    );

    error.message =
      error.type === "encoding.unsupported"
        ? `Unsupported charset "${charset.toUpperCase()}".`
        : `Invalid body: ${error.message}.`;
    throw error;
  }
}

/**
 * Provided a "Request" provided by express or connect (typically a node style
 * HTTPClientRequest), Promise the body data contained.
 */
export async function parseBody(
  req: Request
): Promise<{ [param: string]: unknown }> {
  const { body } = req;

  // If express has already parsed a body as a keyed object, use it.
  if (typeof body === "object" && !(body instanceof Buffer)) {
    return body as { [param: string]: unknown };
  }

  // Skip requests without content types.
  if (req.headers["content-type"] === undefined) {
    return {};
  }

  const typeInfo = contentType.parse(req);

  // If express has already parsed a body as a string, and the content-type
  // was application/graphql, parse the string body.
  if (typeof body === "string" && typeInfo.type === "application/graphql") {
    return { query: body };
  }

  // Already parsed body we didn't recognise? Parse nothing.
  if (body !== null) {
    return {};
  }

  const rawBody = await readBody(req, typeInfo);
  // Use the correct body parser based on Content-Type header.
  switch (typeInfo.type) {
    case "application/graphql":
      return { query: rawBody };
    case "application/json":
      if (jsonObjRegex.test(rawBody)) {
        try {
          return JSON.parse(rawBody);
        } catch {
          // Do nothing
        }
      }
      throw httpError(400, "POST body sent invalid JSON.");
    case "application/x-www-form-urlencoded":
      return querystring.parse(rawBody);
  }

  // If no Content-Type header matches, parse nothing.
  return {};
}

export async function getGraphQLParams(
  request: Request
): Promise<GraphQLParams> {
  const urlData = new URLSearchParams(request.url?.split("?")[1]);
  const bodyData = await parseBody(request);

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
