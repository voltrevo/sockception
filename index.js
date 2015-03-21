"use strict";

/*

var sockception = require("sockception")

var sock = sockception.listen({port: 12345})

sock.receive(function(client) {
    var chatSock = client.send("letsChat")

    chatSock.receive(function(sockMsg) {
        chatSock.send(sockMsg.value)
    })
})

----------------

var sockception = require("sockception")

var sock = sockception.connect("ws://localhost:12345")

sock.receive(function(sockMsg) {
    assert(sockMsg.value === "letsChat")

    sockMsg.send("hi there")

    sockMsg.receiveOne(function(chatSockMsg) {
        assert(chatSockMsg.value === "hi there")
    })
})

*/

var ws = require("ws")

var sockception = exports

sockception.impl = {}
var impl = sockception.impl

impl.idGen = function(prefix) {
    var count = 0
    return function() {
        return prefix + count++
    }
}

sockception.fromPrefixAndTransport = function(prefix, transport) {
    var factory = {
        handlerMap: {},
        idGen: impl.idGen(prefix),
        stringTransport: transport,
        create: function(value, id) {
            var socket = {
                factory: factory,
                value: value,
                id: id,
                send: function(value) {
                    var subsocket = socket.factory.create(null, socket.factory.idGen())
                    transport.send(JSON.stringify([socket.id, subsocket.id, value]))

                    return subsocket
                },
                receive: function(cb) {
                    socket.factory.handlerMap[socket.id] = cb
                }
            }

            return socket
        }
    }

    transport.receive(function(str) {
        var parsed = JSON.parse(str)

        var handler = factory.handlerMap[parsed[0]]

        if (!handler) {
            return
        }

        handler(factory.create(parsed[2], parsed[1]))
    })

    return factory.create(null, factory.idGen())
}

impl.transportPair = function() {
    var handlers = {
        a: function() {},
        b: function() {}
    }

    var transports = {
        a: {
            send: function(msg) {
                process.nextTick(function() {
                    handlers.b(msg)
                })
            },
            receive: function(handler) {
                handlers.a = handler
            }
        },
        b: {
            send: function(msg) {
                process.nextTick(function() {
                    handlers.a(msg)
                })
            },
            receive: function(handler) {
                handlers.b = handler
            }
        }
    }

    return transports
}

sockception.pair = function() {
    var pair = impl.transportPair()

    return {
        a: sockception.fromPrefixAndTransport("a", pair.a),
        b: sockception.fromPrefixAndTransport("b", pair.b)
    }
}

sockception.listen = function(opt) {
    var wss = new ws.Server({port: opt.port})

    var sockHandler = function() {}

    wss.on("connection", function(websock) {
        var handler = function() {} // TODO: timeout queues?

        websock.on("message", function(msg) {
            handler(msg.data.toString())
        })

        sockHandler(sockception.fromPrefixAndTransport(
            "s",
            {
                send: function(s) { websock.send(s) },
                receive: function(cb) { handler = cb }
            }))
    })

    return {
        receive: function(handler) {
            sockHandler = handler
        }
    }
}

sockception.connect = function(address) {
    var websock = new ws(address)

    var handler = function() {}

    websock.on("message", function(msg) {
        handler(msg)
    })

    return sockception.fromPrefixAndTransport(
        "c",
        {
            send: function(s) { websock.send(s) },
            receive: function(cb) { handler = cb }
        })
}