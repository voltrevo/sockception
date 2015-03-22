"use strict";

var assert = require("assert")

var sockception = require("..")
var router = sockception.util.router

describe("router", function(){
    it("should do nothing when nothing is specified", function() {
        var pair = sockception.pair()

        pair.b.receive(router().receiver)

        pair.a.send("Hello abyss")
    })

    it("should call default if specified", function(done) {
        var pair = sockception.pair()

        pair.b.receive(router()
            .default(function() { done() })
        )

        pair.a.send("You don't know what's real anymore")
    })

    it("should call the specified routes", function(done) {
        var pair = sockception.pair()

        var flags = {}

        pair.b.receive(router()
            .route("foo", function() { flags.foo = true })
            .route("bar", function() { flags.bar = true })
            .route("finish", function() {
                assert.equal(flags.foo, true)
                assert.equal(flags.bar, true)

                done()
            })
        )

        pair.a.send("foo")
        pair.a.send("bar")
        pair.a.send("finish")
    })

    it("should call default after unrouting", function(done) {
        var pair = sockception.pair()

        var fooCount = 0
        var defaultCount = 0

        var r = router()
            .route("foo", function(s) {
                fooCount++
                r.unroute("foo")
                s.send("ack")
            })
            .default(function(s) {
                defaultCount++
                s.send("ack")
            })

        pair.b.receive(r)

        pair.a.send("foo").receive(function(s) {
            assert.equal(s.value, "ack")

            assert.equal(fooCount, 1)
            assert.equal(defaultCount, 0)

            pair.a.send("foo").receive(function(s) {
                assert.equal(s.value, "ack")

                assert.equal(fooCount, 1)
                assert.equal(defaultCount, 1)

                done()
            })
        })
    })
})