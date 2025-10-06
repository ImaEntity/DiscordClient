const https = require("https");
const ws = require("ws");
const fs = require("fs");

const GATEWAY_OPCODES = {
    IDENTIFY: 2,
    HEARTBEAT: 1,
    RESUME: 6,

    HELLO: 10,
    HEARTBEAT_ACK: 11,
    RECONNECT: 7,
    DISPATCH: 0,
    INVALID_SESSION: 9
};

const ERRORS = {
    MFA_NO_PROTOCOL  : -1,
    MFA_BAD_PROTOCOL : -2,
    MFA_UNSUPPORTED  : -3,
    MFA_NO_CODE      : -4,
    MFA_BAD_CODE     : -5
}

function formatJSON(data) {
    if(!data) return null;
    return JSON.stringify(data).replace(
        /[\u007F-\uFFFF]/g,
        c => "\\u" + c.padStart(4, '0')
    );
}

function isValidJSON(str) {
    if(/^\s*$/.test(str)) return false;

    str = str.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@');
    str = str.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']');
    str = str.replace(/(?:^|:|,)(?:\s*\[)+/g, '');
    
    return (/^[\],:{}\s]*$/).test(str);
}

function makeRequest(options={}) {
    const path    = options.path ?? "/";
    const method  = options.method ?? "GET";
    const headers = options.headers ?? {};
    const body    = formatJSON(options.body);

    if(body != null) {
        headers["Content-Length"] = Buffer.byteLength(body);
        if(!headers["Content-Type"])
            headers["Content-Type"] = "application/json";
    }

    const reqOpt = {
        host: "discord.com",
        port: 443,
        path: `/api/v10${path}`,
        method,
        headers
    };

    return new Promise(function(resolve) {
        const req = https.request(reqOpt, function(res) {
            const chunks = [];

            res
                .on("data", c => chunks.push(c))
                .on("end", function() {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: isValidJSON(Buffer.concat(chunks)) ?
                            JSON.parse(Buffer.concat(chunks)) :
                            Buffer.concat(chunks)
                    });
                });
        });

        req.write(body);
        req.end();
    });
}

const POST   = (options={}) => makeRequest({...options, method: "POST"  });
const GET    = (options={}) => makeRequest({...options, method: "GET"   });
const PATCH  = (options={}) => makeRequest({...options, method: "PATCH" });
const PUT    = (options={}) => makeRequest({...options, method: "PUT"   });
const DELETE = (options={}) => makeRequest({...options, method: "DELETE"});

async function retrieveToken(options={}) {
    const response = await POST({
        path: "/auth/login",
        body: options
    });

    if(response.mfa == undefined)
        return {success: false, ...response};

    if(!response.mfa) return {
        success: true,
        mfa: false,
        token: response.token
    };

    return {
        success: true,
        mfa: true,
        protocols: Object.entries(response)
            .filter(([key, val]) => key != "mfa" && val === true)
            .map(([key, _]) => key),
        
        finishMFA: async function(options={}) {
            if(!options.protocol) return {
                success: false,
                message: "No MFA protocol specified",
                code: ERRORS.MFA_NO_PROTOCOL
            };

            const protocol = options.protocol.toLowerCase();
            if(!this.protocols.includes(protocol)) return {
                success: false,
                message: "MFA protocol unavailable",
                code: ERRORS.MFA_BAD_PROTOCOL
            };

            if(protocol == "sms") return {
                success: false,
                message: "MFA protocol not supported",
                code: ERRORS.MFA_UNSUPPORTED
            }

            if(!options.code) return {
                success: false,
                message: "No MFA code specified",
                code: ERRORS.MFA_NO_CODE
            };

            const response = await POST({
                path: `/auth/mfa/${protocol}`,
                body: {
                    code: options.code,
                    login_instance_id: response.login_instance_id,
                    ticket: response.ticket
                }
            });

            if(response.token == undefined)
                return {success: false, ...response};

            return {success: true, token: response.token};
        }
    }
}

module.exports = {
    retrieveToken,
    isValidJSON,
    formatJSON,
    GATEWAY_OPCODES,
    ERRORS
};