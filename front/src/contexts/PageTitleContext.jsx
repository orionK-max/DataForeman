import React, { createContext, useContext, useState } from 'react';

const PageTitleContext = createContext();

export const usePageTitle = () => {
  const context = useContext(PageTitleContext);
  if (!context) {
    throw new Error('usePageTitle must be used within PageTitleProvider');
  }
  return context;
};

export const PageTitleProvider = ({ children }) => {
  const [pageTitle, setPageTitle] = useState('');
  const [pageSubtitle, setPageSubtitle] = useState('');

  return (
    <PageTitleContext.Provider value={{ pageTitle, setPageTitle, pageSubtitle, setPageSubtitle }}>
      {children}
    </PageTitleContext.Provider>
  );
};
