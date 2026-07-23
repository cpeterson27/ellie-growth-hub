import { useNavigate } from "react-router-dom";
import { FiBell, FiSearch, FiMenu, FiPlus } from "react-icons/fi";
import Button from "./Button.jsx";
import "./Navbar.css";

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate();


  const handleNewEvent = () => {
    navigate("/events");
  };

  return (
    <header className="navbar">
      <div className="navbar__left">
        <button
          className="navbar__menu"
          type="button"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <FiMenu />
        </button>
        <div>
          <p className="navbar__eyebrow">Ellie AI Growth Operator</p>
          <h1 className="navbar__title">Event marketing made simple.</h1>
        </div>
      </div>

      <div className="navbar__actions">
        <button className="navbar__icon" type="button" aria-label="Search">
          <FiSearch />
        </button>
        <button
          className="navbar__icon"
          type="button"
          aria-label="Notifications"
        >
          <FiBell />
        </button>
        <Button variant="primary" size="sm" onClick={handleNewEvent}>
          <FiPlus />
          New Event
        </Button>
      </div>
    </header>
  );
}
