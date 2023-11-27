'use strict'

const getPort = require('get-port')
const path = require('path')
const agent = require('../plugins/agent')
const appsec = require('../../src/appsec')
const Config = require('../../src/config')
const {
  schema,
  resolvers,
  graphqlCommonTests
} = require('./graphq.test-utils')
withVersions('apollo-server-core', 'express', '>=4', expressVersion => {
  withVersions('apollo-server-core', 'apollo-server-express', apolloServerExpressVersion => {
    const config = {}
    let express, expressServer, ApolloServer, gql
    let app, server

    before(() => {
      return agent.load(['express', 'graphql', 'apollo-server-core', 'http'], { client: false })
    })

    before(() => {
      const apolloServerExpress =
        require(`../../../../versions/apollo-server-express@${apolloServerExpressVersion}`).get()
      ApolloServer = apolloServerExpress.ApolloServer
      gql = apolloServerExpress.gql

      express = require(`../../../../versions/express@${expressVersion}`).get()
    })

    before(async () => {
      app = express()

      const typeDefs = gql(schema)

      server = new ApolloServer({
        typeDefs,
        resolvers
      })

      await server.start()

      server.applyMiddleware({ app })

      config.port = await getPort()

      return new Promise(resolve => {
        expressServer = app.listen({ port: config.port }, () => {
          resolve()
        })
      })
    })

    beforeEach(() => {
      appsec.enable(new Config({ appsec: { enabled: true, rules: path.join(__dirname, 'graphql-rules.json') } }))
    })

    afterEach(() => {
      appsec.disable()
    })

    after(async () => {
      await server.stop()
      expressServer.close()
    })

    graphqlCommonTests(config)
  })
})
