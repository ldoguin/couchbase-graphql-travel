# couchbase-graphql-travel

This is simple example on how to use Couchbase and Apollo GraphQL Server with Node.js.

Relevant code is available in `index.js`. It uses [Apollo GraphQL Server](https://www.apollographql.com/docs/apollo-server/getting-started/) and the [Couchbase travel sample](https://docs.couchbase.com/java-sdk/current/ref/travel-app-data-model.html).

## Gitpod Workspace

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/ldoguin/couchbase-graphql-travel)


You can test this easily with a Gitpod workspace. The Couchbase Travel Sample should be automatically imported on startup.

The GraphQL Server is available on port 4000 and Couchbase's Administration UI is available on port 8091. Those are the only two public port by default. They should open automatically in your browser. If they don't make sure you don't block popups automatically for Gitpod.

The Docker image used in this Gitpod workspace is available here [https://github.com/ldoguin/gitpod-workspacefull-couchbase/](https://github.com/ldoguin/gitpod-workspacefull-couchbase/).
