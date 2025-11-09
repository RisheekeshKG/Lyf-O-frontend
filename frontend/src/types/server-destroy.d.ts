import { Server } from "http";

declare module "server-destroy" {
  export default function serverDestroy(server: Server): void;
}

declare module "http" {
  interface Server {
    destroy(callback?: (err?: Error) => void): void;
  }
}
