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

var createIdGen = function(prefix) {
    var count = 0
    return function() {
        return prefix + count++
    }
}

exports.create = function(prefix, stringTransport) {
    var factory = {
        handlerMap: {},
        idGen: createIdGen(prefix),
        stringTransport: stringTransport,
        create: function(value, id) {
            var socket = {
                factory: factory,
                value: value,
                id: id,
                send: function(value) {
                    var subsocket = socket.factory.create(null, socket.factory.idGen())
                    stringTransport.send(JSON.stringify([socket.id, subsocket.id, value]))

                    return subsocket
                },
                receive: function(cb) {
                    socket.factory.handlerMap[socket.id] = cb
                }
            }

            return socket
        }
    }

    stringTransport.receive(function(str) {
        var parsed = JSON.parse(str)

        var handler = factory.handlerMap[parsed[0]]

        if (!handler) {
            return
        }

        handler(factory.create(parsed[2], parsed[1]))
    })

    return factory.create(null, factory.idGen())
}

exports.listen = function(opt) {
    var wss = new ws.Server({port: opt.port})

    var sockHandler = function() {}

    wss.on("connection", function(websock) {
        var handler = function() {} // TODO: timeout queues?

        websock.on("message", function(msg) {
            handler(msg.data.toString())
        })

        sockHandler(exports.create(
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

exports.connect = function(address) {
    var websock = new ws(address)

    var handler = function() {}

    websock.on("message", function(msg) {
        handler(msg)
    })

    return exports.create(
        "c",
        {
            send: function(s) { websock.send(s) },
            receive: function(cb) { handler = cb }
        })
}