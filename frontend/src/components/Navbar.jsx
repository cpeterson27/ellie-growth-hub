import { useNavigate } from "react-router-dom";
import { FiSearch, FiMenu } from "react-icons/fi";
import "./Navbar.css";

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate();


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
        <button className="navbar__icon" type="button" aria-label="Search contacts" onClick={() => navigate("/contacts")}>
          <FiSearch />
        </button>
      </div>
    </header>
  );
}
