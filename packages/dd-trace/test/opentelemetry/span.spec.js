'use strict'

require('../setup/tap')

const { expect } = require('chai')

const tracer = require('../../').init()

const api = require('@opentelemetry/api')
const TracerProvider = require('../../src/opentelemetry/tracer_provider')
const SpanContext = require('../../src/opentelemetry/span_context')
const { NoopSpanProcessor } = require('../../src/opentelemetry/span_processor')

const { ERROR_MESSAGE, ERROR_STACK, ERROR_TYPE } = require('../../src/constants')
const { SERVICE_NAME, RESOURCE_NAME } = require('../../../../ext/tags')
const kinds = require('../../../../ext/kinds')

const spanKindNames = {
  [api.SpanKind.INTERNAL]: kinds.INTERNAL,
  [api.SpanKind.SERVER]: kinds.SERVER,
  [api.SpanKind.CLIENT]: kinds.CLIENT,
  [api.SpanKind.PRODUCER]: kinds.PRODUCER,
  [api.SpanKind.CONSUMER]: kinds.CONSUMER
}

function makeSpan (...args) {
  const tracerProvider = new TracerProvider()
  tracerProvider.register()
  const tracer = tracerProvider.getTracer()
  return tracer.startSpan(...args)
}

describe('OTel Span', () => {
  it('should inherit service and host name from tracer', () => {
    const span = makeSpan('name')

    const context = span._ddSpan.context()
    expect(context._tags[SERVICE_NAME]).to.equal(tracer._tracer._service)
    expect(context._hostname).to.equal(tracer._hostname)
  })

  it('should expose parent span id', () => {
    tracer.trace('outer', (outer) => {
      const span = makeSpan('name', {})

      expect(span.parentSpanId).to.equal(outer.context()._spanId.toString(16))
    })
  })

  it('should expose span name', () => {
    const span = makeSpan('name')

    expect(span.name).to.equal('name')
  })

  describe('span name default mapping', () => {
    // Explicitly named operation
    it('should map span name from operation.name', () => {
      const span = makeSpan(undefined, {
        attributes: {
          'operation.name': 'test'
        }
      })

      expect(span.name).to.equal('test')
    })

    // HTTP server and client requests
    for (const key of ['http.method', 'http.request.method']) {
      for (const kind of [api.SpanKind.CLIENT, api.SpanKind.SERVER]) {
        const kindName = spanKindNames[kind]
        it(`should map span name from ${kindName} kind with ${key}`, () => {
          const span = makeSpan(undefined, { kind, attributes: { [key]: 'GET' } })
          expect(span.name).to.equal(`http.${kindName}.request`)
        })
      }
    }

    // Database operations
    it('should map span name from db.system if client kind', () => {
      const span = makeSpan(undefined, {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'db.system': 'mysql'
        }
      })

      expect(span.name).to.equal('mysql.query')
    })

    // Messaging systems
    for (const kind of [
      api.SpanKind.CLIENT,
      api.SpanKind.SERVER,
      api.SpanKind.PRODUCER,
      api.SpanKind.CONSUMER
    ]) {
      const kindName = spanKindNames[kind]
      it(`should map span name from messaging.system and messaging.operation when ${kindName} kind`, () => {
        const attributes = {
          'messaging.system': kindName,
          'messaging.operation': 'send'
        }
        const span = makeSpan(undefined, { kind, attributes })
        expect(span.name).to.equal(`${kindName}.send`)
      })
    }

    // AWS client request
    it('should map span name from rpc.system of aws-api if client kind', () => {
      const span = makeSpan(undefined, {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'rpc.system': 'aws-api'
        }
      })

      expect(span.name).to.equal('aws.client.request')
    })

    it('should map span name from rpc.system of aws-api with rpc.service if client kind', () => {
      const span = makeSpan(undefined, {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'rpc.system': 'aws-api',
          'rpc.service': 's3'
        }
      })

      expect(span.name).to.equal('aws.s3.request')
    })

    // RPC client and server requests
    for (const kind of [api.SpanKind.CLIENT, api.SpanKind.SERVER]) {
      const kindName = spanKindNames[kind]
      it(`should map span name from other rpc.system if ${kindName} kind`, () => {
        const span = makeSpan(undefined, {
          kind,
          attributes: {
            'rpc.system': 'system'
          }
        })

        expect(span.name).to.equal(`system.${kindName}.request`)
      })
    }

    // FaaS invocations
    it('should map span name from faas.invoked_provider and faas.invoked_name if client kind', () => {
      const span = makeSpan(undefined, {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'faas.invoked_provider': 'provider',
          'faas.invoked_name': 'name'
        }
      })

      expect(span.name).to.equal('provider.name.invoke')
    })

    it('should map span name from faas.trigger if server kind', () => {
      const span = makeSpan(undefined, {
        kind: api.SpanKind.SERVER,
        attributes: {
          'faas.trigger': 'trigger'
        }
      })

      expect(span.name).to.equal('trigger.invoke')
    })

    // GraphQL
    it('should map span name from graphql.operation.type', () => {
      const span = makeSpan(undefined, {
        attributes: {
          'graphql.operation.type': 'query'
        }
      })

      expect(span.name).to.equal('graphql.server.request')
    })

    // Network
    for (const kind of [api.SpanKind.CLIENT, api.SpanKind.SERVER]) {
      const kindName = spanKindNames[kind]

      it(`should map span name when ${kindName} kind with network.protocol.name`, () => {
        const span = makeSpan(undefined, {
          kind: kind,
          attributes: {
            'network.protocol.name': 'protocol'
          }
        })

        expect(span.name).to.equal(`protocol.${kindName}.request`)
      })

      it(`should map span name when ${kindName} kind without network.protocol.name`, () => {
        const span = makeSpan(undefined, {
          kind: kind
        })

        expect(span.name).to.equal(`${kindName}.request`)
      })
    }

    // Default to span.kind
    for (const kind of [
      api.SpanKind.INTERNAL,
      api.SpanKind.PRODUCER,
      api.SpanKind.CONSUMER
    ]) {
      const kindName = spanKindNames[kind]
      it(`should map span name with ${kindName} kind`, () => {
        const span = makeSpan(undefined, { kind })
        expect(span.name).to.equal(kindName)
      })
    }
    it(`should map span name with default span kind of internal`, () => {
      const span = makeSpan()
      expect(span.name).to.equal('internal')
    })
  })

  it('should copy span name to resource.name', () => {
    const span = makeSpan('name')

    const context = span._ddSpan.context()
    expect(context._tags[RESOURCE_NAME]).to.equal('name')
  })

  it('should expose span context', () => {
    const span = makeSpan('name')

    const spanContext = span.spanContext()
    expect(spanContext).to.be.an.instanceOf(SpanContext)
    expect(spanContext._ddContext).to.be.equal(span._ddSpan.context())
  })

  it('should expose duration', () => {
    const span = makeSpan('name')
    span.end()

    expect(span.duration).to.equal(span._ddSpan._duration)
  })

  it('should expose trace provider resource', () => {
    const resource = 'resource'
    const tracerProvider = new TracerProvider({
      resource
    })
    const tracer = tracerProvider.getTracer()

    const span = tracer.startSpan('name')

    expect(span.resource).to.equal(resource)
  })

  it('should expose tracer instrumentation library', () => {
    const tracerProvider = new TracerProvider()
    const tracer = tracerProvider.getTracer('library name', '1.2.3')

    const span = tracer.startSpan('name')

    expect(span.instrumentationLibrary).to.eql({
      name: 'library name',
      version: '1.2.3'
    })
  })

  it('should update span name', () => {
    const span = makeSpan('name')
    span.updateName('new name')

    expect(span.name).to.equal('new name')
  })

  it('should set attributes', () => {
    const span = makeSpan('name')

    const { _tags } = span._ddSpan.context()

    span.setAttribute('foo', 'bar')
    expect(_tags).to.have.property('foo', 'bar')

    span.setAttributes({ baz: 'buz' })
    expect(_tags).to.have.property('baz', 'buz')
  })

  it('should set status', () => {
    const unset = makeSpan('name')
    const unsetCtx = unset._ddSpan.context()
    unset.setStatus({ code: 0, message: 'unset' })
    expect(unsetCtx._tags).to.not.have.property(ERROR_MESSAGE)

    const ok = makeSpan('name')
    const okCtx = ok._ddSpan.context()
    ok.setStatus({ code: 1, message: 'ok' })
    expect(okCtx._tags).to.not.have.property(ERROR_MESSAGE)

    const error = makeSpan('name')
    const errorCtx = error._ddSpan.context()
    error.setStatus({ code: 2, message: 'error' })
    expect(errorCtx._tags).to.have.property(ERROR_MESSAGE, 'error')
  })

  it('should record exceptions', () => {
    const span = makeSpan('name')

    class TestError extends Error {
      constructor () {
        super('test message')
      }
    }

    const error = new TestError()
    span.recordException(error)

    const { _tags } = span._ddSpan.context()
    expect(_tags).to.have.property(ERROR_TYPE, error.name)
    expect(_tags).to.have.property(ERROR_MESSAGE, error.message)
    expect(_tags).to.have.property(ERROR_STACK, error.stack)
  })

  it('should not set status on already ended spans', () => {
    const span = makeSpan('name')
    span.end()

    const { _tags } = span._ddSpan.context()

    span.setStatus({ code: 2, message: 'error' })
    expect(_tags).to.not.have.property(ERROR_MESSAGE, 'error')
  })

  it('should mark ended and expose recording state', () => {
    const span = makeSpan('name')

    expect(span.ended).to.equal(false)
    expect(span.isRecording()).to.equal(true)
    expect(span._ddSpan).to.have.property('_duration', undefined)

    span.end()

    expect(span.ended).to.equal(true)
    expect(span.isRecording()).to.equal(false)
    expect(span._ddSpan).to.have.property('_duration')
  })

  it('should trigger span processor events', () => {
    const tracerProvider = new TracerProvider()
    const tracer = tracerProvider.getTracer()

    const processor = new NoopSpanProcessor()
    processor.onStart = sinon.stub()
    processor.onEnd = sinon.stub()
    tracerProvider.addSpanProcessor(processor)

    expect(processor.onStart).to.have.not.been.called
    expect(processor.onEnd).to.have.not.been.called

    const span = tracer.startSpan('name')

    expect(processor.onStart).to.have.been.calledWith(span, span._context)
    expect(processor.onEnd).to.have.not.been.called

    span.end()

    expect(processor.onStart).to.have.been.calledWith(span, span._context)
    expect(processor.onEnd).to.have.been.calledWith(span)
  })
})
