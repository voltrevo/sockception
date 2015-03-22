"use strict";

var util = module.exports

/*

sock.receive(router({
    "chat": function(s) {
        
    },
    "login": function(s) {
        
    }
}).receiver)

*/

util.router = function() {
    var router = function(s) {
        var route = router.impl.transform(s.value)
        var handler = router.impl.routes[route] || router.impl.default
        handler(s)
    }

    router.impl = {
        transform: function(value) { return value },
        routes: {},
        default: function() {}
    }

    router.transform = function(transform) {
        router.impl.transform = transform
        return router
    }

    router.route = function(route, handler) {
        router.impl.routes[route] = handler
        return router
    }

    router.unroute = function(route) {
        delete router.impl.routes[route]
        return router
    }

    router.default = function(handler) {
        router.impl.default = handler
        return router
    }

    return router
}