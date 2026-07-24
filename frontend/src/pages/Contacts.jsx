import { useEffect, useState } from "react";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import Table from "../components/Table.jsx";
import {
  fetchContacts,
  importContactsFromApollo,
  importContactsFromMonday,
} from "../services/api.js";

const columns = [
  { header: "Name", accessor: "name" },
  { header: "Email", accessor: "email" },
  { header: "Company", accessor: "company" },
  { header: "Status", accessor: "status" },
];

const importCopy = {
  monday: {
    title: "Import Contacts from Monday CRM?",
    body: "This will pull contacts from your Monday CRM into Ellie AI. Do you want to continue?",
  },
  apollo: {
    title: "Import Contacts from Apollo?",
    body: "This will use Apollo API credits to pull contacts into Ellie AI. Do you want to continue?",
  },
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadContacts() {
    try {
      setLoading(true);
      const response = await fetchContacts();
      setContacts(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  function openImportConfirmation(source) {
    setError("");
    setSelectedSource(source);
    setConfirmOpen(true);
  }

  function closeImportConfirmation() {
    if (importing) return;
    setConfirmOpen(false);
    setSelectedSource(null);
  }

  async function confirmImport() {
    if (!selectedSource) return;

    try {
      setImporting(true);
      setError("");

      if (selectedSource === "monday") {
        await importContactsFromMonday();
      } else {
        await importContactsFromApollo();
      }

      setConfirmOpen(false);
      setSelectedSource(null);
      await loadContacts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to import contacts");
    } finally {
      setImporting(false);
    }
  }

  const selectedCopy = selectedSource ? importCopy[selectedSource] : null;

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Import and manage outreach contacts.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button
            variant="outline"
            onClick={() => openImportConfirmation("monday")}
            disabled={importing}
          >
            Import from Monday CRM
          </Button>
          <Button
            variant="primary"
            onClick={() => openImportConfirmation("apollo")}
            disabled={importing}
          >
            Import from Apollo
          </Button>
        </div>
      </div>

      <DashboardCard title="Contacts">
        {error ? <p className="form-error">{error}</p> : null}
        <Table
          columns={columns}
          data={contacts}
          loading={loading}
          emptyMessage="No contacts found yet."
        />
      </DashboardCard>

      <Modal
        isOpen={isConfirmOpen}
        onClose={closeImportConfirmation}
        title={selectedCopy?.title || "Import Contacts"}
        footer={(
          <>
            <Button
              variant="outline"
              onClick={closeImportConfirmation}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button loading={importing} onClick={confirmImport}>
              Confirm Import
            </Button>
          </>
        )}
      >
        <p>{selectedCopy?.body}</p>
      </Modal>
    </div>
  );
}
