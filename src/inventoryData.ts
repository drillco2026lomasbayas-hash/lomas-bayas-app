// Definición de items de inventario con categorías
export interface InventoryItem {
    key: string;
    name: string;
    sap: string;
}

export interface InventoryCategory {
    name: string;
    items: InventoryItem[];
}

export const INVENTORY_CATEGORIES: InventoryCategory[] = [
    {
        name: 'ROC 8,11 y 14',
        items: [
            { key: 'roc_martPM62', name: 'Mart PM6.2EX HDW Ret QL-6 3 1/2"Reg M 3E', sap: '1135749' },
            { key: 'roc_bitQL6', name: 'Bit QL-6 Ø6 1/2" Cara Plana Welding', sap: '1135750' },
            { key: 'roc_amortP68', name: 'P6-8 Amort. HD 3 1/2" ATSM x 3 1/2" RegH', sap: '1135753' },
            { key: 'roc_adaptador114', name: 'Ø114.3 3 beco M x 3 beco H L=305', sap: '1135752' },
            { key: 'roc_barras45', name: 'Barras 4 ½ x 6000mm x 6.35 3 beco', sap: '1135751' },
        ]
    },
    {
        name: 'TRICONOS',
        items: [
            { key: 'tricono_10', name: 'BIT,DRIL;TRICONE,DIA 10-5/8 IN', sap: '1140327' },
            { key: 'tricono_12', name: 'BIT,DRIL;TRICONE,DIA 12-1/4 IN', sap: '1151231' },
        ]
    },
    {
        name: 'PV 05',
        items: [
            { key: 'pv05_absorber', name: 'ABSORBER,SHCK;PIN,VIPER 275 PIT,API REG', sap: '1146032' },
            { key: 'pv05_adapter858', name: 'ADAPTER;8-5/8 X 19 IN,SUPERIOR,PIN 6-5/8', sap: '1146021' },
            { key: 'pv05_rod858', name: 'ROD,DRIL;DIA 8-5/8 IN,LG 40 FT,1 IN', sap: '1146018' },
            { key: 'pv05_adapter858_30', name: 'ADAPTER;8-5/8 X 30-3/4 IN,PIN 6 BECO BOX', sap: '1146024' },
            { key: 'pv05_ring858', name: 'RING;CENTERING,8-5/8 X 13 IN,DRIL,PIT', sap: '1146028' },
        ]
    },
    {
        name: 'PE 6 Y 7 DE BAJA',
        items: [
            { key: 'pe67_absorber', name: 'ABSORBER,SHCK;PIN,DRIL SK-16,API BOX', sap: '1146031' },
            { key: 'pe67_adapter858', name: 'ADAPTER;8-5/8 X 30 IN,UPR,SK-16', sap: '1146020' },
            { key: 'pe67_rod858', name: 'ROD,DRIL;DIA 8-5/8 IN,LG 40 FT,1 IN', sap: '1146016' },
            { key: 'pe67_adapter8625', name: 'ADAPTER;8.6255 X 30 IN,BOX 6 BECO USE', sap: '1146022' },
            { key: 'pe67_ring858', name: 'RING;CENTERING,8-5/8 X 13 IN,DRIL,SK-16', sap: '1146027' },
        ]
    },
    {
        name: 'PE 9 Y 10',
        items: [
            { key: 'pe910_amort', name: 'AMORTIGUADOR IMPAC;PASADOR,CAJA API REG', sap: '1151653' },
            { key: 'pe910_adapter1074', name: 'ADAPTER;10-3/4 X 40 IN,SUPERIOR PIN', sap: '1151650' },
            { key: 'pe910_rod1074', name: 'ROD,DRIL;DIA 10-3/4 IN,LG 30 FT,8 BOX', sap: '1151649' },
            { key: 'pe910_adapter1074_80', name: 'ADAPTER;10-3/4 X 80 IN,PIN BECO 8 BOX', sap: '1151651' },
            { key: 'pe910_ring1074', name: 'RING;CENTERING,10-3/4 X 16 IN,DRIL', sap: '1146029' },
        ]
    },
    {
        name: 'PE 12 Y 13',
        items: [
            { key: 'pe1213_absorber', name: 'ABSORBER,SHCK;SHOCK SUB 7,40/8-5/8 O/D', sap: '1699118' },
            { key: 'pe1213_adapter', name: 'ADAPTER,PIPE;THREAD SAVER 8 5/8 IN X 24', sap: '1699119' },
            { key: 'pe1213_bushing', name: 'BUSHING,PIPE;DRILL PIPE BAR X2 - BAR FOL', sap: '1699130' },
            { key: 'pe1213_triconeAdapter', name: 'ADAPTER,PIPE;TRICONE ADAPTER SUB BIT 8 5', sap: '1699131' },
            { key: 'pe1213_deckBushing', name: 'BUSHING,PIPE;DECK BUSHING (RING GUIDE)', sap: '1699132' },
        ]
    }
];

// Crear objeto inicial de inventario con todos los valores en 0
export function createEmptyInventory(): Record<string, number> {
    const inventory: Record<string, number> = {};
    INVENTORY_CATEGORIES.forEach(cat => {
        cat.items.forEach(item => {
            inventory[`${item.key}_central`] = 0;
            inventory[`${item.key}_mina`] = 0;
        });
    });
    return inventory;
}
