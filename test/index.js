"use strict";

var assert = require("assert")

var sockception = require("..")

var callSequence = function() {
    var i = 0
    var seq = arguments
    return function() {
        var ii = i++
        assert(ii < seq.length)
        return seq[ii].apply(undefined, arguments)
    }
}

describe("callSequence", function() {
    it("should call the arguments in order", function() {
        var seq = callSequence(
            function(x) { return x },
            function(x) { return x * x },
            function(x) { return x * x * x })

        assert.equal(seq(10), 10)
        assert.equal(seq(11), 11 * 11)
        assert.equal(seq(12), 12 * 12 * 12)
    })
})

describe("process", function() {
    describe("nextTick", function() {
        it("should call function later", function(done) {
            var flag = false

            process.nextTick(function() {
                assert.equal(flag, true)
                done()
            })

            flag = true
        })
    })
})

describe("sockception", function() {
    describe("impl", function() {
        describe("idGen", function() {
            it("should produce a sequence beginning with specified prefix", function() {
                var idGen = sockception.impl.idGen("x")

                assert.equal(idGen(), "x0")
                assert.equal(idGen(), "x1")
                assert.equal(idGen(), "x2")
                assert.equal(idGen(), "x3")
            })
        })

        describe("transportPair", function() {
            it("should send a string from a to b", function(done) {
                var pair = sockception.impl.transportPair()

                pair.a.send("hello")

                pair.b.receive(function(msg) {
                    assert.equal(msg, "hello")
                    done()
                })
            })

            it("should send a string from b to a", function(done) {
                var pair = sockception.impl.transportPair()

                pair.b.send("hello")

                pair.a.receive(function(msg) {
                    assert.equal(msg, "hello")
                    done()
                })
            })

            it("should support multiple bi-directional messages", function(done) {
                var pair = sockception.impl.transportPair()
                var receiveCount = 0

                pair.a.send("hello")

                pair.b.send("foo")
                pair.b.send("bar")

                pair.a.receive(callSequence(
                    function(msg) {
                        assert.equal(msg, "foo")
                        receiveCount++
                    },
                    function(msg) {
                        assert.equal(msg, "bar")
                        receiveCount++
                    }))

                pair.b.receive(callSequence(
                    function(msg) {
                        assert.equal(msg, "hello")
                        receiveCount++
                    },
                    function(msg) {
                        assert.equal(msg, "world")
                        receiveCount++

                        assert.equal(receiveCount, 4)
                        done()
                    }))

                pair.a.send("world")
            })
        })

        describe("initRoute", function() { // TODO: getRoute
            it("should lazily create routes", function() {
                var routes = {
                    children: {}
                }

                var foo = sockception.impl.initRoute(routes, ["foo"])
                
                assert.deepEqual(routes, {
                    children: {
                        foo: {
                            children: {},
                            value: {}
                        }
                    }
                })

                assert.strictEqual(foo, routes.children.foo.value)

                var bar = sockception.impl.initRoute(routes, ["bar"])

                assert.deepEqual(routes, {
                    children: {
                        foo: {
                            children: {},
                            value: {}
                        },
                        bar: {
                            children: {},
                            value: {}
                        }
                    }
                })

                assert.strictEqual(bar, routes.children.bar.value)

                var foobar = sockception.impl.initRoute(routes, ["foo", "bar"])

                assert.deepEqual(routes, {
                    children: {
                        foo: {
                            children: {
                                bar: {
                                    children: {},
                                    value: {}
                                }
                            },
                            value: {}
                        },
                        bar: {
                            children: {},
                            value: {}
                        }
                    }
                })

                assert.strictEqual(foobar, routes.children.foo.children.bar.value)
            })
        })
    })

    describe("fromPrefixAndTransport", function() {
        var fixture = function() {
            var transports = sockception.impl.transportPair()
            return {
                sock: sockception.fromPrefixAndTransport("test", transports.a),
                dst: transports.b
            }
        }

        it("should have a value of null", function() {
            assert.equal(fixture().sock.value, null)
        })

        it("should have an impl.route of [\"0\"]", function() {
            assert.deepEqual(fixture().sock.impl.routePath, ["0"])
        })

        it("should have a generator that produces the expected ids", function() {
            var fx = fixture()
            assert.equal(fx.sock.impl.factory.idGen(), "test0")
            assert.equal(fx.sock.impl.factory.idGen(), "test1")
            assert.equal(fx.sock.impl.factory.idGen(), "test2")
            assert.equal(fx.sock.impl.factory.idGen(), "test3")
        })

        it("should send a message in the expected format", function(done) {
            var fx = fixture()

            fx.sock.send("Hello")

            fx.dst.receive(function(str) {
                assert.equal(str, JSON.stringify([["0"], ["test0"], "Hello"]))
                done()
            })
        })
    })

    describe("pair", function() {
        it("should send and receive a basic message correctly", function(done) {
            var pair = sockception.pair()

            pair.a.send("Hello world!")

            pair.b.receiveOne(function(sock) {
                assert.equal(sock.value, "Hello world!")
                done()
            })
        })

        it("should send and receive json correctly", function(done) {
            var pair = sockception.pair()

            var messages = [
                {},
                {foo: "bar"},
                [1, 2, 3],
                [1, 2, 3, "four", {value: "five"}]
            ]

            messages.forEach(function(msg) {
                pair.a.send(msg)
            })

            var count = 0
            pair.b.receiveMany(function(s, stop) {
                assert.deepEqual(s.value, messages[count])
                count++

                if (count === messages.length) {
                    stop()
                    done()
                }
            })
        })

        it("should ignore after first message with receiveOne", function(done) {
            var pair = sockception.pair()

            var count = 0
            pair.b.receiveOne(function() {
                count++
            })

            pair.a.send()
            pair.a.send()

            process.nextTick(function() {
                assert.equal(count, 1)
                done()
            })
        })

        it("should ignore extra messages when stop is called with receiveMany", function(done) {
            var pair = sockception.pair()

            var count = 0
            pair.b.receiveMany(function(s, stop) {
                count++
                if (count === 2) {
                    stop()
                }
            })

            pair.a.send()
            pair.a.send()
            pair.a.send()

            process.nextTick(function() {
                assert.equal(count, 2)
                done()
            })
        })

        it("should satisfy a chat echo pattern", function(done) {
            var pair = sockception.pair()

            // a/server side:
            ;(function() {
                var chat = pair.a.send("chat")

                chat.receiveMany(function(s) {
                    chat.send(s.value)
                })
            })()

            // b/client side:
            ;(function() {
                pair.b.receiveOne(function(chat) {
                    assert.equal(chat.value, "chat")

                    var messages = [
                        "Hello world!",
                        "foo",
                        "bar",
                        "foobar"
                    ]

                    messages.forEach(function(msg) {
                        chat.send(msg)
                    })

                    var count = 0
                    chat.receiveMany(function(s, stop) {
                        assert.equal(s.value, messages[count])
                        count++

                        if (count === messages.length) {
                            stop()
                            done()
                        }
                    })
                })
            })()
        })

        it("should support long reply chains", function(done) {
            var pair = sockception.pair()
            var len = 100

            var handler = function(s) {
                if (s.value === len) {
                    done()
                } else {
                    s.send(s.value + 1).receiveOne(handler)
                }
            }

            pair.a.receiveOne(handler)
            pair.b.send(1).receiveOne(handler)
        })
    })

    describe("listen, connect", function() {
        it("should send and receive a basic message correctly", function(done) {
            var server = sockception.listen({port: 15319})

            server.receiveMany(function(sock) {
                sock.send("hello")
            })

            var client = sockception.connect("ws://localhost:15319/")

            client.receiveOne(function(sock) {
                assert.equal(sock.value, "hello")
                done()
            })
        })
    })
})