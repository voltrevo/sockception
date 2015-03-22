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

var sockception

;(function(module, require){
    var ws = require("ws")

    sockception = module.exports

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
            transport: transport,
            create: function(id, value) {
                var socket = {
                    impl: {
                        factory: factory,
                        id: id
                    },
                    value: value,
                    send: function(value) {
                        var impl = socket.impl
                        var factory = impl.factory
                        var subsocket = factory.create(factory.idGen(), null)
                        factory.transport.send(JSON.stringify([impl.id, subsocket.impl.id, value]))

                        return subsocket
                    },
                    receive: function(cb) {
                        socket.impl.factory.handlerMap[socket.impl.id] = cb
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

            handler(factory.create(parsed[1], parsed[2]))
        })

        return factory.create("0", null)
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
        if (!ws) {
            throw new Error("Websocket server not supported in this environment")
        }

        var wss = new ws.Server({port: opt.port})

        var sockHandler = function() {}

        wss.on("connection", function(websock) {
            var handler = function() {} // TODO: timeout queues?

            websock.on("message", function(msg) {
                handler(msg.toString())
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

    impl.clientWebsocketTransport = (
        ws ?
        function(addr) {
            var sock = new ws(addr)
            var handler = function() {}

            sock.on("message", function(msg) {
                handler(msg.toString())
            })

            return {
                send: function(msg) { sock.send(msg) },
                receive: function(cb) { handler = cb }
            }
        } :
        function(addr) {
            var sock = new WebSocket(addr)

            return {
                send: function(msg) { sock.send(msg) },
                receive: function(cb) { sock.onmessage = function(msg) { cb(msg.data.toString()) } }
            }
        }
    )

    sockception.connect = function(address) {
        return sockception.fromPrefixAndTransport("c", impl.clientWebsocketTransport(address))
    }
})(
    typeof module === "undefined" ? {exports: {}} : module,
    typeof require === "undefined" ? function() {} : require
)