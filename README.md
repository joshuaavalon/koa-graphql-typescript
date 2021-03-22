# GraphQL Koa Middleware

[![License][license_badge]][license] [![Pipelines][pipelines_badge]][pipelines] [![NPM][npm_badge]][npm] [![semantic-release][semantic_release]][semantic_release_badge]

This is a fork from [koa-graphql] and [express-graphql]. Since koa-graphql does not seems to update its package.json to allow `"graphql": "^15.0.0"`, I forked it.

## Getting Started

```
npm i koa-graphql-typescript
```

It is a drop-in replacement for koa-graphql except no graphiql included.

```typescript
import Koa from "koa";
import Router from "koa-router";
import { graphqlHTTP } from "koa-graphql-typescript";

const app = new Koa();
const router = new Router();

router.post("/graphql", graphqlHTTP({ schema: MyGraphQLSchema }));

app.use(router.routes()).use(router.allowedMethods());
```

## Differences

There are some differences between koa-graphql-typescript and koa-graphql.

### No Longer Depends On express-graphql

koa-graphql is somewhat between an adapter for express-graphql and being its own library. If it is adapter and it converts Koa request into Express request, it can get the latest updates from express-graphql.

However, koa-graphql has its own dependencies and logic on top of express-graphql. It will be better off on its own.

### No Longer Include graphiql

There are many Graphql clients available, including server-side and standalone clients. There is not need to include a client that it may not be used and its dependencies.

If you want to provide a server-side client on the same endpoint, you can provide it via `router.get` because graphql endpoint only uses POST.

### Rewritten In TypeScript Instead Of Flow

I am more familiar with TypeScript. Also, the popularity of TypeScript is far superior than Flow. But this should not matter if you just use the library.

[license]: ./LICENSE
[license_badge]: https://img.shields.io/badge/license-Apache--2.0-green.svg
[pipelines]: https://github.com/joshuaavalon/koa-graphql-typescript/actions/workflows/main.yml
[pipelines_badge]: https://github.com/joshuaavalon/koa-graphql-typescript/actions/workflows/main.yml/badge.svg
[npm]: https://www.npmjs.com/package/koa-graphql-typescript
[npm_badge]: https://img.shields.io/npm/v/koa-graphql-typescript/latest.svg
[semantic_release]: https://github.com/semantic-release/semantic-release
[semantic_release_badge]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[koa-graphql]: https://github.com/graphql-community/koa-graphql
[express-graphql]: https://github.com/graphql/express-graphql
