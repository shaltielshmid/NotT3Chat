import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import PropTypes from 'prop-types';
import { modelApi } from '../services/modelApi';

const ModelsContext = createContext();

export const useModels = () => {
  const context = useContext(ModelsContext);
  if (!context) {
    throw new Error('useModels must be used within a ModelsProvider');
  }
  return context;
};

export const ModelsProvider = ({ children }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadModels = async () => {
      setLoading(true);
      setError('');
      try {
        const modelData = await modelApi.getModels();
        setModels(modelData);
      } catch (err) {
        setError('Failed to load models');
        console.error('Error loading models:', err);
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const modelData = await modelApi.getModels();
      setModels(modelData);
    } catch (err) {
      setError('Failed to load models');
      console.error('Error loading models:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    models,
    loading,
    error,
    refetch,
  };

  return (
    <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
  );
};

ModelsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
