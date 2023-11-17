const { resolveNaming } = require('../../dd-trace/test/plugins/helpers')

const rawExpectedSchema = {
  command: {
    v0: {
      opName: 'aerospike.command',
      serviceName: 'test-aerospike'
    },
    v1: {
      opName: 'aerospike.command',
      serviceName: 'test-aerospike'
    }
  }
}

module.exports = {
  rawExpectedSchema: rawExpectedSchema,
  expectedSchema: resolveNaming(rawExpectedSchema)
}
