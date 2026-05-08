import { setGlobalOptions } from "firebase-functions";

setGlobalOptions({ maxInstances: 10 });

export { oauthCallback } from "./auth/hlOAuth";
export { hlProxy } from "./proxy/hlProxy";
export { projectsApi } from "./projects/projectsCrud";
export { snapshotsApi } from "./snapshots/snapshotsCrud";
export { generateApp } from "./generation/generate";
