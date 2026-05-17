import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createRouter } from "./router";

const handler = createStartHandler({ createRouter })(defaultStreamHandler);
export default { fetch: handler };
