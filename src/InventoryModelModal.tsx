import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { InventorySubModel } from './inventoryData';

interface InventoryModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemKey: string;
  itemName: string;
  modelToEdit: InventorySubModel | null;
  onSave: (itemKey: string, model: InventorySubModel) => void;
}

export const InventoryModelModal: React.FC<InventoryModelModalProps> = ({
  isOpen,
  onClose,
  itemKey,
  itemName,
  modelToEdit,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [sap, setSap] = useState('Del SAP');
  const [mina, setMina] = useState(0);
  const [central, setCentral] = useState(0);
  const [sn, setSn] = useState('');

  useEffect(() => {
    if (modelToEdit) {
      setName(modelToEdit.name || '');
      setBrand(modelToEdit.brand || '');
      setSap(modelToEdit.sap || 'Del SAP');
      setMina(modelToEdit.mina || 0);
      setCentral(modelToEdit.central || 0);
      setSn(modelToEdit.sn || '');
    } else {
      setName('');
      setBrand('');
      setSap('Del SAP');
      setMina(0);
      setCentral(0);
      setSn('');
    }
  }, [modelToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor ingrese el nombre del modelo.');
      return;
    }

    const newModel: InventorySubModel = {
      id: modelToEdit ? modelToEdit.id : `mod_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: name.trim(),
      brand: brand.trim(),
      sap: sap.trim() || 'Del SAP',
      mina: Number(mina) || 0,
      central: Number(central) || 0,
      sn: sn.trim() || undefined,
    };

    onSave(itemKey, newModel);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          background: '#0b2b45',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {modelToEdit ? 'Editar Modelo de Producto' : '+ Agregar Nuevo Modelo'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {itemName}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Nombre del Modelo *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: TRICONO Ø 10 5/8 WLS65S (S875) BECO"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Marca / Descripción
            </label>
            <input
              type="text"
              placeholder="Ej: Shereate(Drillco) - Ø 10 5/8&quot; o WLS"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Código SAP (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Del SAP o 33030719"
              value={sap}
              onChange={(e) => setSap(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#047857', marginBottom: '4px' }}>
                Stock Bodega Mina
              </label>
              <input
                type="number"
                min="0"
                value={mina}
                onChange={(e) => setMina(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: '1px solid #a7f3d0',
                  background: '#f0fdf4',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textAlign: 'center'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '4px' }}>
                Stock Bodega Central
              </label>
              <input
                type="number"
                min="0"
                value={central}
                onChange={(e) => setCentral(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textAlign: 'center'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#854d0e', marginBottom: '4px' }}>
              Números de Serie / Observaciones (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: SN 875221, SN 875222..."
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: '6px',
                border: '1px solid #fde047',
                background: '#fefce8',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.65rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                flex: 2,
                padding: '0.65rem',
                borderRadius: '8px',
                border: 'none',
                background: '#f59e0b',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Save size={16} />
              <span>Guardar Modelo</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
