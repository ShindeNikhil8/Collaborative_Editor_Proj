"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileToIdentity = profileToIdentity;
function profileToIdentity(p) {
    return { userId: p.userId, name: p.name, ip: p.ip };
}
