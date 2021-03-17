import type { DocumentNode, FormattedExecutionResult } from "graphql";

/**
 * All information about a GraphQL request.
 */
export interface RequestInfo {
  /**
   * The parsed GraphQL document.
   */
  document?: DocumentNode;

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

export type MayBePromise<T> = T | Promise<T>;
