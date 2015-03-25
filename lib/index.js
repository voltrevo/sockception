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
            next = ret.children[route[i]]
            if (!next) {
                break
            }
            ret = next
            i++
        }

        while (i < route.length) {
            next = {children: {}}
            ret.children[route[i]] = next
            ret = next
            i++
        }

        ret.data = ret.data || {}
        ret = ret.data

        return ret
    }

    sockception.fromPrefixAndTransport = function(prefix, transport) {
        var factory = {
            routes: {
                children: {}
            },
            idGen: impl.idGen(prefix),
            transport: transport,
            create: function(route, value) {
                var socket = {
                    impl: {
                        factory: factory,
                        route: route,
                        mappedRoute: sockception.impl.mapRoute(factory.routes, route), // TODO: lazily evaluate to avoid memory consumption from unused sockets
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
                    route: function(routeItem) { // TODO: should this be making duplicates of routes like this? should work fine...
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

                    e.g.:
                    sock
                        .withRoute('chat', function() {
                            // chatStuff
                        })
                        .withRoute('error', function() {
                            // handle errors
                        })
                    */
                    /* Proposal:
                    multiRoute: function(routeReceivers) {
                        for (var routeItem in routeReceivers) {
                            socket.route(routeItem).receive(routeReceivers[routeItem])
                        }
                    }

                    e.g.:
                    sock.multiRoute({
                        'chat': function() {
                            // chatStuff
                        },
                        'error': function() {
                            // handle errors
                        }
                    })
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
        var transports = {
            a: {
                impl: {
                    handler: function() {},
                    closeHandler: function() {}
                },
                send: function(msg) {
                    process.nextTick(function() { // TODO: browser compatibility
                        transports.b.impl.handler(msg)
                    })
                },
                close: function() {
                    process.nextTick(function() {
                        transports.a.impl.closeHandler()
                        transports.b.impl.closeHandler()
                    })
                },
                receive: function(handler) {
                    transports.a.impl.handler = handler
                },
                onclose: function(handler) {
                    transports.a.impl.handler = handler
                }
            },
            b: {
                impl: {
                    handler: function() {},
                    closeHandler: function() {}
                },
                send: function(msg) {
                    process.nextTick(function() {
                        transports.a.impl.handler(msg)
                    })
                },
                close: function() {
                    process.nextTick(function() {
                        transports.b.impl.closeHandler()
                        transports.a.impl.closeHandler()
                    })
                },
                receive: function(handler) {
                    transports.b.impl.handler = handler
                },
                onclose: function(handler) {
                    transports.b.impl.handler = handler
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