// tslint:disabke:no-unused-expression
import * as BBPromise from 'bluebird'
import { expect } from 'chai'
import { getServicesMock, getRecordServices } from '../test/mocks'
import { TOPIC, RECORD_ACTIONS as RECORD_ACTION } from '../../binary-protocol/src/message-constants'

import { DefaultOptions, Options } from '../client-options'
import { RecordCore, RECORD_STATE } from './record-core'

import { spy, assert, match } from 'sinon'
import { EVENT } from '../constants'

describe('record core', () => {

describe('online scenario, not individual tests', () => {
    let whenCompleted: sinon.SinonSpy
    let recordCore: RecordCore
    let options: Options
    let services: any
    let recordServices: any
    const context = {} as any

    beforeEach(() => {
        whenCompleted = spy()
        services = getServicesMock()
        recordServices = getRecordServices(services)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.SUBSCRIBECREATEANDREAD,
                name
            })

        services.storageMock
            .expects('get')
            .once()
            .callsArgWith(1, name, -1, null)

        options = { ...DefaultOptions, discardTimeout: 20, recordReadTimeout: 20, subscriptionInterval: -1 }

        services.connection.isConnected = true
        recordCore = new RecordCore(name, services, options, recordServices, whenCompleted)
    })

    afterEach(() => {
        services.verify()
    })

    it('doesn`t send updates before ready', () => {
        services.connectionMock
            .expects('sendMessage')
            .never()

        recordCore.set({ data: { firstname: 'Wolfram' } })
    })

    it('doesn`t send patches before ready', () => {
        services.connectionMock
            .expects('sendMessage')
            .never()

        recordCore.set({ path: 'firstname', data: 'Wolfram' })
    })

    it('triggers ready callback on read response', () => {
        const readySpy = spy()
        recordCore.whenReady(context, readySpy)
        recordServices.readRegistry.recieve(READ_RESPONSE)

        assert.calledOnce(readySpy)
        assert.calledWithExactly(readySpy, context)
    })

    it('triggers ready promise on read response', async () => {
        let readyContext = null
        const promise = recordCore.whenReady(context)
        promise.then(result => readyContext = result)

        recordServices.readRegistry.recieve(READ_RESPONSE)

        await BBPromise.delay(0)
        expect(readyContext).to.equal(context)
    })

    it('sends update messages for updates after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.UPDATE,
                name,
                parsedData: { firstname: 'Bob' },
                version: 2
            })

        recordCore.set({ data: { firstname: 'Bob' } })
    })

    it('sends patch messages for path changes after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.PATCH,
                name,
                path: 'firstname',
                parsedData: 'Bob',
                version: 2
            })

        recordCore.set({ path: 'firstname', data: 'Bob' })
    })

    it('sends update messages for updates write ack after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.UPDATE_WITH_WRITE_ACK,
                name,
                parsedData: { firstname: 'Bob' },
                correlationId: '1',
                version: 2
            })

        recordCore.set({ data: { firstname: 'Bob' }, callback: () => {} })
    })

    it('sends patch messages for path changes after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.PATCH_WITH_WRITE_ACK,
                name,
                path: 'firstname',
                parsedData: 'Bob',
                correlationId: '1',
                version: 2
            })

        recordCore.set({ path: 'firstname', data: 'Bob', callback: () => {} })
    })

    it('sends erase messages for erase after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.ERASE,
                name,
                path: 'firstname',
                version: 2
            })

        recordCore.set({ path: 'firstname' })
    })

    it('sends erase write ack messages for erase after when ready', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
            .expects('sendMessage')
            .once()
            .withExactArgs({
                topic: TOPIC.RECORD,
                action: RECORD_ACTION.ERASE_WITH_WRITE_ACK,
                name,
                path: 'firstname',
                correlationId: '1',
                version: 2
            })

        recordCore.set({ path: 'firstname', callback: () => {} })
    })

    it('queues discarding record when no longer needed', () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)
        recordCore.discard()

        expect(recordCore.recordState).to.equal(RECORD_STATE.UNSUBSCRIBING)

        expect(recordCore.isReady).to.equal(true)
    })

    it('removes pending discard when usages increases', async () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)
        recordCore.discard()
        recordCore.usages = 1

        await BBPromise.delay(30)

        expect(recordCore.recordState).to.equal(RECORD_STATE.READY)

        expect(recordCore.isReady).to.equal(true)
    })

    it('sends discard when unsubscribe timeout completed', async () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)
        recordCore.discard()

        services.connectionMock
        .expects('sendMessage')
        .once()
        .withExactArgs({
            topic: TOPIC.RECORD,
            action: RECORD_ACTION.UNSUBSCRIBE,
            name
        })

        await BBPromise.delay(30)

        expect(recordCore.recordState).to.equal(RECORD_STATE.UNSUBSCRIBED)

        assert.calledOnce(whenCompleted)
        assert.calledWithExactly(whenCompleted, name)

        expect(recordCore.isReady).to.equal(false)
    })

    it('sends delete when ready', async () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
        .expects('sendMessage')
        .once()
        .withExactArgs({
            topic: TOPIC.RECORD,
            action: RECORD_ACTION.DELETE,
            name
        })

        recordCore.delete()

        expect(recordCore.recordState).to.equal(RECORD_STATE.DELETING)

        assert.notCalled(whenCompleted)

        expect(recordCore.isReady).to.equal(true)
    })

    it('calls delete when delete is confirmed', async () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        services.connectionMock
        .expects('sendMessage')
        .once()

        recordCore.delete()

        recordCore.handle({
            topic: TOPIC.RECORD,
            action: RECORD_ACTION.DELETE_SUCCESS,
            name
        })

        expect(recordCore.recordState).to.equal(RECORD_STATE.DELETED)

        assert.calledOnce(whenCompleted)
        assert.calledWithExactly(whenCompleted, name)

        // tslint:disable-next-line:no-unused-expression
        expect(recordCore.isReady).to.equal(false)
    })

    it('calls delete when delete happens remotely', async () => {
        recordServices.readRegistry.recieve(READ_RESPONSE)

        recordCore.handle({
            topic: TOPIC.RECORD,
            action: RECORD_ACTION.DELETED,
            name
        })

        expect(recordCore.recordState).to.equal(RECORD_STATE.DELETED)

        assert.calledOnce(whenCompleted)
        assert.calledWithExactly(whenCompleted, name)

        // tslint:disable-next-line:no-unused-expression
        expect(recordCore.isReady).to.equal(false)
    })
})

describe('record core offline', () => {
    let whenCompleted: sinon.SinonSpy
    let recordCore: RecordCore
    let options: Options
    let services: any
    let recordServices: any

    beforeEach(() => {
        whenCompleted = spy()
        services = getServicesMock()
        recordServices = getRecordServices(services)
        options = Object.assign({}, DefaultOptions, { discardTimeout: 20, recordReadTimeout: 20 })

        services.connectionMock
            .expects('sendMessage')
            .never()

        services.storageMock
            .expects('get')
            .once()
            .callsArgWith(1, name, 1, { firstname: 'wolfram' })

        services.connection.isConnected = false
        recordCore = new RecordCore(name, services, options, recordServices, whenCompleted)
    })

    afterEach(() => {
        services.verify()
        recordServices.verify()
    })

    it('triggers ready callback on load', () => {
        const context = {} as any
        const readySpy = spy()
        recordCore.whenReady(context, readySpy)

        assert.calledOnce(readySpy)
        assert.calledWithExactly(readySpy, context)
    })

    it('sets update messages for updates after when ready', () => {
        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, { firstname: 'Bob' }, match.func)

        recordCore.set({ data: { firstname: 'Bob' } })
    })

    it('sends patch messages for path changes after when ready', () => {
        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, { firstname: 'Bob' }, match.func)

        recordCore.set({ path: 'firstname', data: 'Bob' })
    })

    it('responds to update write acks with an offline error', async () => {
        const ackCallback = spy()

        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, { firstname: 'Bob' }, match.func)

        recordCore.set({ data: { firstname: 'Bob' }, callback: ackCallback })

        await BBPromise.delay(0)

        assert.calledOnce(ackCallback)
        assert.calledWithExactly(ackCallback, EVENT.CLIENT_OFFLINE, name)
    })

    it('sends patch messages for path changes after when ready', async () => {
        const ackCallback = spy()

        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, { firstname: 'Bob' }, match.func)

        recordCore.set({ path: 'firstname', data: 'Bob', callback: ackCallback })

        await BBPromise.delay(0)

        assert.calledOnce(ackCallback)
        assert.calledWithExactly(ackCallback, EVENT.CLIENT_OFFLINE, name)
    })

    it('sends erase messages for erase after when ready', () => {
        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, {}, match.func)

        recordCore.set({ path: 'firstname' })
    })

    it('sends erase write ack messages for erase after when ready', async () => {
        const ackCallback = spy()

        services.storageMock
            .expects('set')
            .once()
            .withExactArgs(name, 2, {}, match.func)

        recordCore.set({ path: 'firstname', callback: ackCallback })

        await BBPromise.delay(0)

        assert.calledOnce(ackCallback)
        assert.calledWithExactly(ackCallback, EVENT.CLIENT_OFFLINE, name)
    })

    it('queues discarding record when no longer needed', () => {
        recordCore.discard()

        expect(recordCore.recordState).to.equal(RECORD_STATE.UNSUBSCRIBING)

        expect(recordCore.isReady).to.equal(true)
    })

    it('removes pending discard when usages increases', async () => {
        recordCore.discard()
        recordCore.usages++

        await BBPromise.delay(30)

        expect(recordCore.recordState).to.equal(RECORD_STATE.READY)

        expect(recordCore.isReady).to.equal(true)
    })

    it('removes record when completed', async () => {
        recordCore.discard()

        await BBPromise.delay(40)

        expect(recordCore.recordState).to.equal(RECORD_STATE.UNSUBSCRIBED)

        assert.calledOnce(whenCompleted)
        assert.calledWithExactly(whenCompleted, name)

        expect(recordCore.isReady).to.equal(false)
    })

    it.skip('sends delete when ready', async () => {
        services.storageMock
            .expects('delete')
            .once()
            .withExactArgs(name, match.func)

        recordCore.delete()

        expect(recordCore.recordState).to.equal(RECORD_STATE.DELETING)

        assert.notCalled(whenCompleted)

        expect(recordCore.isReady).to.equal(true)
    })

    it.skip('calls delete when delete is confirmed', async () => {
        services.storageMock
            .expects('delete')
            .once()
            .withExactArgs(name, match.func)
            .callsArgWith(1, name)

        recordCore.delete()

        await BBPromise.delay(0)

        // deleted
        expect(recordCore.recordState).to.equal(RECORD_STATE.DELETED)

        assert.calledOnce(whenCompleted)
        assert.calledWithExactly(whenCompleted, name)

        expect(recordCore.isReady).to.equal(false)
    })
    })
})

const name = 'recordA'
const READ_RESPONSE = {
    topic: TOPIC.RECORD,
    action: RECORD_ACTION.READ_RESPONSE,
    name,
    parsedData: {},
    version: 1
}
