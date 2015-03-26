"use strict";

var assert = require("assert")

var sockception = require("..")
var router = sockception.util.router
var chain = sockception.util.chain
var once = sockception.util.once

describe("router", function(){
    it("should do nothing when nothing is specified", function() {
        var pair = sockception.pair()

        pair.b.receiveOne(router().receiver)

        pair.a.send("Hello abyss")
    })

    it("should call default if specified", function(done) {
        var pair = sockception.pair()

        pair.b.receiveOne(router()
            .default(function() { done() })
        )

        pair.a.send("You don't know what's real anymore")
    })

    it("should call the specified routes", function(done) {
        var pair = sockception.pair()

        var flags = {}

        pair.b.receiveMany(router()
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

        pair.b.receiveMany(r)

        pair.a.send("foo").receiveOne(function(s) {
            assert.equal(s.value, "ack")

            assert.equal(fooCount, 1)
            assert.equal(defaultCount, 0)

            pair.a.send("foo").receiveOne(function(s) {
                assert.equal(s.value, "ack")

                assert.equal(fooCount, 1)
                assert.equal(defaultCount, 1)

                done()
            })
        })
    })

    it("should call transformed route", function(done) {
        var pair = sockception.pair()

        var fooSum = 0
        var barSum = 0

        pair.b.receiveMany(chain()
            .push(router()
                .transform(function(value) {
                    return value.route
                })
                .route("foo", function(s) {
                    fooSum += s.value.content
                })
                .route("bar", function(s) {
                    barSum += s.value.content
                }))
            .push(sockception.util.acker))

        pair.a.send({route: "foo", content: 5})
        pair.a.send({route: "bar", content: 7})
        pair.a.send({route: "foo", content: 1})
        pair.a.send({route: "bar", content: 1}).receiveOne(function() {
            assert.equal(fooSum, 6)
            assert.equal(barSum, 8)
            done()
        })
    })
})

describe("chain", function() {
    it("should happily do nothing when empty", function(done) {
        var pair = sockception.pair()

        pair.b.receiveOne(chain())
        pair.a.send("wollolo")

        process.nextTick(done)
    })

    it("should call handlers in order", function(done) {
        var pair = sockception.pair()

        var tag = ""

        pair.b.receiveMany(chain()
            .push(function() {
                assert.equal(tag, "")
                tag = "foo"
            })
            .push(function() {
                assert.equal(tag, "foo")
                tag = "bar"
            })
            .push(function() {
                assert.equal(tag, "bar") // TODO: does this actually get tested?
                tag = ""
            }))

        pair.a.send("I'm ignored")
        pair.a.send("Me too")
        pair.a.send("Quit complaining, it's not relevant to the test")

        process.nextTick(done)
    })
})

describe("once", function() {
    it("should only call handler once, then ignore", function(done) {
        var pair = sockception.pair()

        var count = 0

        pair.b.receiveMany(once(function() {
            count++
        }))

        pair.a.send("one")
        pair.a.send("two")

        process.nextTick(function() {
            assert.equal(count, 1)
            done()
        })
    })
})