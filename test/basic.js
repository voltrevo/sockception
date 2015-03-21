"use strict";

var assert = require("assert")

var sockception = require("../index")

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
    })
    
    /*describe("createInternal", function() {
        it("should send and receive a basic message correctly", function(done) {
            var pair = sockception.createInternalPair()

            pair.a.send("hello")

            pair.b.receive(function(sock) {
                assert.equal(sock.value, "hello")
                done()
            })
        })
    })*/

    /*describe("listen, connect", function() {
        it("should send and receive a basic message correctly", function(done) {
            var server = sockception.listen({port: 15319})

            server.receive(function(sock) {
                sock.send("hello")
            })

            var client = sockception.connect("ws://localhost:15319/")

            client.receive(function(sock) {
                assert.equal(sock.value, "hello")
                done()
            })
        })
    })*/
})