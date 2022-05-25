const { ApolloServer, gql } = require('apollo-server');
var couchbase = require('couchbase')

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

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
      typeairline: String
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
    hotels: [Hotel]
    routes: [Route]
  }
`;

const resolvers = {
  Query: {
    airports: () => queryAllByType('airport'),
    airlines: () => queryAllByType('airline'),
    hotels: () => queryAllByType('hotel'),
    routes: () => queryAllByType('route'),
  },
  Route: {
    async airline(parent) {
      // const airline = await queryCluster(`Select t.* FROM \`travel-sample\` as t  where META().id = "${parent.airlineid}"`);
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


// Connect to Couchbase Cluster

async function getDoc(docId){
  console.log("getDoc " + docId);
  return cluster().then(async (cluster) => {
    const bucket = cluster.bucket("travel-sample");
    const defaultCollection = bucket.defaultCollection();
    const doc = await defaultCollection.get(docId);
    return doc.content;
}, (reject) => {console.log(reject)})
}


async function queryCluster(n1qlQuery){
    return cluster().then(async (cluster) => {
        const airports = await cluster.query(n1qlQuery)
       return airports.rows;
    })
}


async function queryAllByType(type){
    return queryCluster(`select \`travel-sample\`.* from \`travel-sample\` where type = "${type}" limit 10`)
}

async function cluster() {

  // For a secure cluster connection, use `couchbases://<your-cluster-ip>` instead.
  const clusterConnStr = 'couchbase://localhost'
  const username = 'Administrator'
  const password = 'Administrator'
  const bucketName = 'travel-sample'

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
  
  

  