import { useEffect } from 'react';
import { usePageTitle } from '../contexts/PageTitleContext';

const useSetPageTitle = (title, subtitle = '') => {
  const { setPageTitle, setPageSubtitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle(title);
    setPageSubtitle(subtitle);
  }, [title, subtitle, setPageTitle, setPageSubtitle]);
};

export default useSetPageTitle;
