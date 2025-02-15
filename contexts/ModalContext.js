import { createContext, useContext, useState, useCallback } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  // modalType: e.g., "featuredPack", "favoriteTeam", "points", "prize"
  // modalProps: any additional props needed by the modal.
  const [modalConfig, setModalConfig] = useState({
	modalType: null,
	modalProps: {},
  });

  const openModal = useCallback((modalType, modalProps = {}) => {
	setModalConfig({ modalType, modalProps });
  }, []);

  const closeModal = useCallback(() => {
	setModalConfig({ modalType: null, modalProps: {} });
  }, []);

  return (
	<ModalContext.Provider value={{ modalConfig, openModal, closeModal }}>
	  {children}
	</ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
