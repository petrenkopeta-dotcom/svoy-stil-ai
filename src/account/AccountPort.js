export const ACCOUNT_DELETE_STATES=Object.freeze({IDLE:"idle",CONFIRMING:"confirming",DELETING:"deleting",DELETED:"deleted",VERIFICATION_FAILED:"verification_failed",UNAVAILABLE:"unavailable",ERROR:"error"});
export function assertAccountPort(port){if(typeof port?.deleteAccount!=="function")throw new TypeError("AccountPort.deleteAccount is required");return port;}
export function unavailableAccountPort(){return{available:false,async deleteAccount(){throw Object.assign(new Error("unavailable"),{code:"provider_unavailable"})}};}
