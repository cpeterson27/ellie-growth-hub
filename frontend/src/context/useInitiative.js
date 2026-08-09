import { useContext } from "react";
import InitiativeContext from "./InitiativeContextValue.js";

const emptyInitiative = {
  campaigns: [],
  selected: null,
  selectedId: "all",
  setSelectedId: () => {},
};

export default function useInitiative() {
  return useContext(InitiativeContext) || emptyInitiative;
}
