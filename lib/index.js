"use strict";

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

    sockception.impl.mapRoute = function(routes, route) {
        var ret = routes

        var i = 0
        var next

        while (i < route.length) {
            next = ret.sub[route[i]]
            if (!next) {
                break
            }
            ret = next
            i++
        }

        while (i < route.length) {
            next = {sub: {}}
            ret.sub[route[i]] = next
            ret = next
            i++
        }

        return ret
    }

    sockception.fromPrefixAndTransport = function(prefix, transport) {
        var factory = {
            routes: {
                sub: {}
            },
            idGen: impl.idGen(prefix),
            transport: transport,
            create: function(route, value) {
                var socket = {
                    impl: {
                        factory: factory,
                        route: route,
                        mappedRoute: sockception.impl.mapRoute(factory.routes, route)
                    },
                    value: value,
                    send: function(value) {
                        var impl = socket.impl
                        var factory = impl.factory
                        var subsocket = factory.create([factory.idGen()], null)
                        factory.transport.send(JSON.stringify([impl.route, subsocket.impl.route, value]))

                        return subsocket
                    },
                    receive: function(cb) {
                        socket.impl.mappedRoute.handler = cb
                    },
                    route: function(routeItem) {
                        var impl = socket.impl
                        var newRoute = impl.route.slice()
                        newRoute.push(routeItem)
                        return impl.factory.create(newRoute, null)
                    }
                    /* Proposal:
                    withRoute: function(routeItem, cb) {
                        cb(socket.route(routeItem))
                        return socket
                    }
                    */
                }

                return socket
            }
        }

        transport.receive(function(str) {
            var parsed = JSON.parse(str)

            var handler = sockception.impl.mapRoute(factory.routes, parsed[0]).handler

            if (!handler) {
                return
            }

            handler(factory.create(parsed[1], parsed[2]))
        })

        return factory.create(["0"], null)
    }

    impl.transportPair = function() {
        var handlers = {
            a: function() {},
            b: function() {}
        }

        var transports = {
            a: {
                send: function(msg) {
                    process.nextTick(function() { // TODO: browser compatibility
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

    sockception.util = require("./util")
})(
    typeof module === "undefined" ? {exports: {}} : module,
    typeof require === "undefined" ? function() {} : require
)