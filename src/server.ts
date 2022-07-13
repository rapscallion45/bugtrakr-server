import app from "./app";
import http from "http";
import { PORT } from "./utils/config";
import { connectToDB } from "./db";

connectToDB();

const server = http.createServer(app);

server.listen(PORT || 3001, () => {
  console.log(`Server running on port ${PORT || 3001}`);
});
