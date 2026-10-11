import { setGlobalDispatcher } from "undici";
import { NoNetworkDispatcher } from "../src/fixtures/replay.js";

// docs/04 §3: tests never reach the network. A cache miss is a failure, not a fallback.
setGlobalDispatcher(new NoNetworkDispatcher());
