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

    sockception.impl.initRoute = function(routes, routePath) {
        var ret = routes

        var i = 0
        var next

        while (i < routePath.length) {
            next = ret.children[routePath[i]]
            if (!next) {
                break
            }
            ret = next
            i++
        }

        while (i < routePath.length) {
            next = {children: {}}
            ret.children[routePath[i]] = next
            ret = next
            i++
        }

        ret.value = ret.value || {}
        ret = ret.value

        return ret
    }

    sockception.impl.getRoute = function(routes, routePath) {
        var ret = routes

        var i = 0
        var next

        while (i < routePath.length) {
            next = ret.children[routePath[i]]
            if (!next) {
                return undefined
            }
            ret = next
            i++
        }

        ret = ret.value

        return ret
    }

    sockception.impl.lazyCall = function(f) {
        var set = false
        var value
        return function() {
            if (set) {
                return value
            } else {
                return f()
            }
        }
    }

    sockception.fromPrefixAndTransport = function(prefix, transport, log) {
        log = log || {}
        log.debug = log.debug || function() {}
        log.info = log.info || function() {}
        log.error = log.error || function() {}

        var factory = {
            routes: {
                children: {}
            },
            idGen: impl.idGen(prefix),
            transport: transport,
            closeHandlers: [],
            create: function(routePath, value) {
                var socket = {
                    impl: {
                        factory: factory,
                        routePath: routePath,
                        route: sockception.impl.lazyCall(function() {
                            return sockception.impl.initRoute(factory.routes, routePath)
                        })
                    },
                    value: value,
                    send: function(value) {
                        var impl = socket.impl
                        var factory = impl.factory
                        var subsocket = factory.create([factory.idGen()], null)
                        var sendObj = [impl.routePath, subsocket.impl.routePath, value]
                        var sendStr = JSON.stringify(sendObj)
                        log.debug("Sending: " + sendStr)
                        factory.transport.send(sendStr)

                        return subsocket
                    },
                    receive: function(cb) {
                        socket.impl.route().handler = cb
                    },
                    route: function(routeItem) { // TODO: should this be making duplicates of routes like this? should work fine...
                        var impl = socket.impl
                        var newRoutePath = impl.routePath.slice()
                        newRoutePath.push(routeItem)
                        return impl.factory.create(newRoutePath, null)
                    },
                    multiRoute: function(routeReceivers) { // TODO: test
                        for (var routeItem in routeReceivers) {
                            socket.route(routeItem).receive(routeReceivers[routeItem])
                        }
                    },
                    onclose: function(cb) {
                        socket.impl.factory.closeHandlers.push(cb)
                    }
                }

                return socket
            }
        }

        transport.receive(function(str) {
            log.debug("Received: " + str)
            var parsed = JSON.parse(str)

            var route = sockception.impl.getRoute(factory.routes, parsed[0])

            if (!route) {
                log.error("Route not set: " + JSON.stringify(parsed[0]))
                return
            }

            if (!route || !route.handler) {
                log.error("Route but no handler for: " + JSON.stringify(parsed[0]))
                return
            }

            route.handler(factory.create(parsed[1], parsed[2]))
        })

        var firstSock = factory.create(["0"], null)

        var closed = false

        firstSock.close = function() {
            if (!closed) {
                transport.close()
            }
        }

        transport.onclose(function() {
            closed = true
            factory.closeHandlers.forEach(function(handler) {
                handler()
            })
        })

        return firstSock
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
                    transports.a.impl.closeHandler = handler
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
                    transports.b.impl.closeHandler = handler
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
                    close: function() { websock.close() }, // TODO: test
                    receive: function(cb) {
                        websock.onmessage = function(msg) {
                            cb(msg.data.toString())
                        }
                    },
                    onclose: function(cb) { websock.onclose = cb } // TODO: test
                },
                opt.log))
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

            return {
                send: function(msg) { sock.send(msg) },
                close: function() { sock.close() },
                receive: function(cb) { sock.onmessage = function(msg) {
                    cb(msg.data.toString())
                }},
                onclose: function(cb) { sock.onclose = cb }
            }
        } :
        function(addr) {
            var sock = new WebSocket(addr)

            return {
                send: function(msg) { sock.send(msg) },
                close: function() { sock.close() },
                receive: function(cb) { sock.onmessage = function(msg) { cb(msg.data.toString()) } },
                onclose: function(cb) { sock.onclose = cb }
            }
        }
    )

    sockception.connect = function(address, log) {
        return sockception.fromPrefixAndTransport("c", impl.clientWebsocketTransport(address), log)
    }

    sockception.util = require("./util")
})(
    typeof module === "undefined" ? {exports: {}} : module,
    typeof require === "undefined" ? function() {} : require
)