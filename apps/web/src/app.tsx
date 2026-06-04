import { StartClient } from "@tanstack/react-start";
import { router } from "./router";

export default function App() {
  return <StartClient router={router} />;
}
