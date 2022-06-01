const { ApolloServer, gql } = require('apollo-server');
const couchbase = require('couchbase');
const graphqlFields = require('graphql-fields');

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  type CursorPageInfo {
    startCursor: String!
    endCursor: String!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type OffsetPageInfo {
    totalCount: Int!
    currentPage: Int!
    pagesCount: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type RouteEdge {
    node: Route!
    cursor: String!
  }

  type RouteConnection {
    totalCount: Int
    edges: [RouteEdge]!
    pageInfo: CursorPageInfo!
  }

  type HotelPage {
    nodes: [Hotel]!
    pageInfo: OffsetPageInfo!
  }

  type Airline {
    id: Int
    type: String
    name: String
    iata: String
    icao: String
    callsign: String
    country: String
  }

  type Route {
      id: String
      type: String
      airline: Airline
      sourceairport: Airport
      destinationairport: String
      stops: String
      equipment: String
      schedule: [Schedule]
  }

  type Schedule {
      day: Int
      utc: String
      flight: String
  }

  type Airport {
      id: String
      type: String
      airportname: String
      city: String
      country: String
      faa: String
      icao: String
      tz: String
      geo: Geo
  }

  type Geo {
      lat: Float
      lon: Float
      alt: Int
  }

  type Hotel {
    address: String
    checkin: String
    checkou: String
    city: String
    country: String
    description: String
    free_breakfast: Boolean
    free_internet: Boolean,
    free_parking: Boolean
    geo: Geo
    id: Int
    name: String
    pets_ok: Boolean
    price: String
    state: String
    type: String
    url: String
    vacancy: Boolean
  }
  
  type Query {
    airports: [Airport]
    airlines: [Airline]
    hotels(limit: Int!, offset: Int!): HotelPage
    routes(first: Int, after: String, last: Int, before: String): RouteConnection!
  }
`;

const resolvers = {
  Query: {
    airports: () => queryAllByType('airport'),
    airlines: () => queryAllByType('airline'),
    hotels: (parent, args, context, info) => offsetQueryAllByType(parent, args, context, info, 'hotel'),
    routes: (parent, args, context, info) => cursorQueryAllByType(parent, args, context, info, 'route'),
  },
  Route: {
    async airline(parent) {
      // const airline = await queryCluster(`Select t.* FROM \`travel-sample\` as t  where META().id = "${parent.airlineid}"`);
      // Use a K/V get instead of a N1QL query
      const doc = await getDoc(parent.airlineid);
      return doc;
    },
    async sourceairport(parent) {
      const airport = await queryCluster(`Select t.* FROM \`travel-sample\` as t  where type = "airport" AND faa = "${parent.sourceairport}"`);
      return airport[0];
    },
  }
};

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({
  typeDefs,
  resolvers,
  csrfPrevention: true,
});


// A Ley/Value get, faster than any query.
async function getDoc(docId){
  console.log("getDoc " + docId);
  return cluster().then(async (cluster) => {
    const bucket = cluster.bucket("travel-sample");
    const defaultCollection = bucket.defaultCollection();
    const doc = await defaultCollection.get(docId);
    return doc.content;
}, (reject) => {console.log(reject)})
}

async function cursorQueryAllByType(parent, args, context, info, type){
  return cluster().then(async (cluster) => {
      const first = args.first;
      const after = args.after;
      const last = args.last;
      const before = args.before;
      // retrieve the Query fields
      const fieldsWithSubFieldsArgs = graphqlFields(info, {}, {excludedFields: ['__typename'], processArguments: true });
      // Flatten all top level fields to use them in the Select N1QL query
      const flattenTopFields = Object.keys(fieldsWithSubFieldsArgs.edges.node).join(',')
      console.log(fieldsWithSubFieldsArgs)
      if (!after && !before) {
        if (first) {
          return await offsetAfterQuery(cluster, flattenTopFields, type, first);
        } else if (last){
          return await offsetBeforeQuery(cluster, flattenTopFields, type, last)
        } else {
          // default returns 10 first 
          return await offsetAfterQuery(cluster, flattenTopFields, type, 10);
        }
      }
      if (after)
        return await offsetAfterQuery(cluster, flattenTopFields, type, first, after);
      if (before)
        return await offsetBeforeQuery(cluster, flattenTopFields, type, last, before)
  })
}

async function offsetAfterQuery(cluster, flattenTopFields, type, first, after) {
  if (!after) after = 10;
  const q = `
              SELECT Meta().id as cursor, {${flattenTopFields}} as node
              FROM \`travel-sample\`
              WHERE type = "${type}"
              ${(after) ?
                    `AND Meta().id >=  ${typeof after == "string" ?
                       `"${after}"` : after}`
                : ""}
              ORDER BY Meta().id ASC
              LIMIT  ${after ? first + 2 : first + 1};
          `;
  const queryAnswer = await cluster.query(q);
  var edges = queryAnswer.rows;
  var hasNextPage = true;
  var hasPreviousPage = false;
  if (after) {
    if (edges[0].cursor == after) {
      hasPreviousPage = true;
      edges.splice(0,1);
    } else if (edges.length == first + 2 ) {
      edges.splice(-1)
      hasPreviousPage = false;
    }
  }
  if (edges.length > first) {
    edges.splice(-1)
  } else {
    hasNextPage = false;
  }
  const pageInfo = {
    startCursor: edges[0].cursor,
    endCursor: edges[edges.length - 1].cursor,
    hasNextPage: hasNextPage,
    hasPreviousPage: hasPreviousPage,
  };
  return { edges: edges, pageInfo: pageInfo };
}

async function offsetBeforeQuery(cluster, flattenTopFields, type, last, before) {
  if (!last) last = 10;
  const q = `
              SELECT Meta().id as cursor, {${flattenTopFields}} as node
              FROM \`travel-sample\`
              WHERE type = "${type}"
              ${(before) ?
                    `AND Meta().id <=  ${typeof before == "string" ?
                       `"${before}"` : before}`
                : ""}
              ORDER BY cursor DESC
              LIMIT  ${before ? last + 2 : last + 1};
          `;
  const queryAnswer = await cluster.query(q);
  var edges = queryAnswer.rows;

  var hasPreviousPage;
  var hasNextPage = true
  if (before) {
    if (edges[edges.length - 1].cursor == before) {
      hasNextPage = true;
      edges.splice(0,1);
    } else if (edges.length == last + 2 ) {
      edges.splice(-1)
      hasNextPage = false;
    }
  }
  if (edges.length > last) {
    edges.splice(-1)
    hasPreviousPage = true;
  } else {
    hasPreviousPage = false;
  }
  edges.reverse()
  const pageInfo = {
    startCursor: edges[0].cursor,
    endCursor: edges[edges.length - 1].cursor,
    hasPreviousPage: hasPreviousPage,
    hasNextPage: hasNextPage,
  };
  return { edges: edges, pageInfo: pageInfo };
}

// Query all documents of given type with offset pagination support
async function offsetQueryAllByType(parent, args, context, info, type){
  return cluster().then(async (cluster) => {
      const offset = args.offset;
      const limit = args.limit;
      // retrieve the Query fields
      const fieldsWithSubFieldsArgs = graphqlFields(info, {}, {excludedFields: ['__typename'], processArguments: true });
      // Flatten all top level fields to use them in the Select N1QL query
      const flattenTopFields = Object.keys(fieldsWithSubFieldsArgs.nodes).join(',')
      const q = `
          SELECT total, results 
          LET total = (SELECT count(*) as res FROM \`travel-sample\` as \`results\` WHERE type = "${type}")[0].res,
              results = (SELECT ${flattenTopFields}
          FROM \`travel-sample\`
          WHERE type = "${type}"
          ORDER BY id
          LIMIT ${limit}
          OFFSET ${offset} );
      `;
      const queryAnswer = await cluster.query(q);
      // Make offset pagination MetaData
      const total = queryAnswer.rows[0].total
      const results = queryAnswer.rows[0].results
      const currentPage = (offset == 0) ? 1 : Math.floor(offset/limit) + 1;
      var pagesCount = Math.floor(total/limit);
      if (total%limit> 0 ) pagesCount++;
      const hasNextPage = (offset + limit < total) ? true : false;
      const hasPreviousPage = (offset > 0) ? true : false;
      const pageInfo = {
        totalCount: total,
        currentPage: currentPage,
        pagesCount: pagesCount,
        hasNextPage: hasNextPage,
        hasPreviousPage: hasPreviousPage
      };
     return {nodes: results, pageInfo: pageInfo};
  })
}

// Query all documents of given type
async function queryAllByType(type){
    return queryCluster(`select \`travel-sample\`.* from \`travel-sample\` where type = "${type}"`)
}

async function queryCluster(n1qlQuery){
  return cluster().then(async (cluster) => {
      const queryAnswer = await cluster.query(n1qlQuery)
     return queryAnswer.rows;
  })
}

async function cluster() {
  // For a secure cluster connection, use `couchbases://<your-cluster-ip>` instead.
  const clusterConnStr = 'couchbase://localhost'
  const username = 'Administrator'
  const password = 'Administrator'

  const cluster = await couchbase.connect(clusterConnStr, {
    username: username,
    password: password
  })
  return cluster;

}


// The `listen` method launches a web server.
server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
  
  