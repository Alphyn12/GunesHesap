from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


CONTRACT_VERSION = "GH-PV-ENGINE-CONTRACT-2026.04-v1"


class FlexibleModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class ScenarioInput(FlexibleModel):
    key: str = "on-grid"
    label: str = "On-Grid"
    proposalTone: str = "commercial-grid"


class SiteInput(FlexibleModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    cityName: Optional[str] = None
    ghi: Optional[float] = None
    timezone: str = "Europe/Istanbul"

    @field_validator("lat")
    @classmethod
    def validate_latitude(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        numeric = float(value)
        if numeric < -90 or numeric > 90:
            raise ValueError("latitude must be between -90 and 90")
        return numeric

    @field_validator("lon")
    @classmethod
    def validate_longitude(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        numeric = float(value)
        if numeric < -180 or numeric > 180:
            raise ValueError("longitude must be between -180 and 180")
        return numeric


class RoofInput(FlexibleModel):
    areaM2: float = 0
    tiltDeg: float = 33
    azimuthDeg: float = 180
    azimuthName: str = "Güney"
    shadingPct: float = 0
    soilingPct: float = 0
    usableRoofRatio: float = 0.75
    geometry: Optional[Dict[str, Any]] = None
    sections: List[Dict[str, Any]] = Field(default_factory=list)


class SystemInput(FlexibleModel):
    panelType: str = "mono_perc"
    panelWattPeak: Optional[float] = None
    panelAreaM2: Optional[float] = None
    panelTempCoeffPerC: Optional[float] = None
    panelDegradationRate: Optional[float] = None
    panelFirstYearDegradationRate: Optional[float] = None
    bifacialGain: Optional[float] = None
    inverterType: str = "string"
    inverterEfficiency: Optional[float] = None
    cableLossPct: Optional[float] = None
    wiringMismatchPct: float = 0
    targetPowerKwp: Optional[float] = None
    batteryEnabled: bool = False
    battery: Optional[Dict[str, Any]] = None
    netMeteringEnabled: bool = False
    evEnabled: bool = False
    ev: Optional[Dict[str, Any]] = None
    heatPumpEnabled: bool = False
    heatPump: Optional[Dict[str, Any]] = None
    batteryMaxChargeKw: Optional[float] = None
    batteryMaxDischargeKw: Optional[float] = None
    offgridInverterAcKw: Optional[float] = None
    offgridInverterSurgeMultiplier: Optional[float] = None
    layoutSnapshot: Optional[Dict[str, Any]] = None
    authoritativePanelCount: Optional[int] = None
    chosenSystemPowerKwp: Optional[float] = None


class LoadInput(FlexibleModel):
    dailyConsumptionKwh: float = 0
    monthlyConsumptionKwh: Optional[List[float]] = None
    hourlyConsumption8760: Optional[List[float]] = None
    hourlyProduction8760: Optional[List[float]] = None
    offgridCriticalLoad8760: Optional[List[float]] = None
    offgridDevices: Optional[List[Dict[str, Any]]] = None
    offgridCriticalFraction: Optional[float] = None


class OffgridInput(FlexibleModel):
    calculationMode: str = "basic"
    generatorEnabled: bool = False
    generatorKw: float = 0
    generatorFuelCostPerKwh: float = 0
    generatorCapexTry: float = 0
    generatorStrategy: str = "critical-backup"
    generatorFuelType: str = "diesel"
    generatorSizePreset: str = "auto"
    generatorReservePct: float = 0
    generatorStartSocPct: float = 0
    generatorStopSocPct: Optional[float] = None
    generatorMaxHoursPerDay: Optional[float] = None
    generatorMinLoadRatePct: Optional[float] = None
    generatorChargeBatteryEnabled: Optional[bool] = None
    generatorMaintenanceCostTry: float = 0
    generatorOverhaulHours: float = 0
    generatorOverhaulCostTry: float = 0
    badWeatherLevel: str = ""
    fieldGuaranteeMode: bool = False
    productionSourcePriority: List[str] = Field(default_factory=list)
    loadSourcePriority: List[str] = Field(default_factory=list)
    fieldEvidenceRequired: List[str] = Field(default_factory=list)
    fieldModelStressRequired: List[str] = Field(default_factory=list)
    fieldAcceptanceRequired: List[str] = Field(default_factory=list)
    fieldOperationRequired: List[str] = Field(default_factory=list)
    fieldRevalidationRequired: List[str] = Field(default_factory=list)
    fieldRevalidationSkipped: List[str] = Field(default_factory=list)
    dispatchLevel: str = "L2"
    fieldGuaranteeGate: Optional[str] = None


class TariffInput(FlexibleModel):
    tariffType: str = "residential"
    tariffRegime: str = "auto"
    importRateTryKwh: float = 0
    exportRateTryKwh: float = 0
    tariffInputMode: str = "net-plus-fee"
    distributionFeeTryKwh: float = 0
    contractedPowerKw: float = 0
    annualPriceIncrease: float = 0.12
    discountRate: float = 0.18
    sourceDate: Optional[str] = None
    sourceCheckedAt: Optional[str] = None


class GovernanceInput(FlexibleModel):
    evidence: Dict[str, Any] = Field(default_factory=dict)
    proposalApproval: Optional[Dict[str, Any]] = None
    quoteInputsVerified: bool = False
    hasSignedCustomerBillData: bool = False


class ParityInput(FlexibleModel):
    contractPurpose: str = "frontend-backend-production-parity"
    authoritativeSourceRule: str = "one-production-source-per-run"
    browserModel: Optional[str] = None
    backendModel: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


class EngineRequest(FlexibleModel):
    schema_: str = Field(default=CONTRACT_VERSION, alias="schema")
    requestedEngine: str = "python-backend"
    scenario: ScenarioInput = Field(default_factory=ScenarioInput)
    site: SiteInput = Field(default_factory=SiteInput)
    roof: RoofInput = Field(default_factory=RoofInput)
    system: SystemInput = Field(default_factory=SystemInput)
    load: LoadInput = Field(default_factory=LoadInput)
    offgrid: Optional[OffgridInput] = None
    tariff: TariffInput = Field(default_factory=TariffInput)
    governance: GovernanceInput = Field(default_factory=GovernanceInput)
    parity: ParityInput = Field(default_factory=ParityInput)


class EngineSource(FlexibleModel):
    engine: str = "python-backend"
    provider: str = "python-pvlib-ready"
    source: str = "Python backend"
    confidence: str = "medium"
    engineQuality: str = "adapter-ready"
    pvlibReady: bool = True
    pvlibBacked: bool = False
    fallbackUsed: bool = False
    notes: List[str] = Field(default_factory=list)


class EngineResponse(FlexibleModel):
    schema_: str = Field(default=CONTRACT_VERSION, alias="schema")
    generatedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    engineSource: EngineSource = Field(default_factory=EngineSource)
    production: Dict[str, Any] = Field(default_factory=dict)
    losses: Dict[str, Any] = Field(default_factory=dict)
    financial: Dict[str, Any] = Field(default_factory=dict)
    proposal: Dict[str, Any] = Field(default_factory=dict)
    offgridL2Results: Optional[Dict[str, Any]] = None
    raw: Dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "solar-rota-engineering-backend"
    version: str = "0.1.0"
    pvlibAvailable: bool = False
    pvlibBackedEngineAvailable: bool = False
    activeEngineWhenAvailable: str = "pvlib-backed"
    fallbackEngine: str = "python-deterministic-fallback"


class PanelThermalRequest(FlexibleModel):
    vocStcV: float = Field(..., gt=0, description="Open-circuit voltage at STC (V)")
    vocCoeffPctPerC: float = Field(..., description="Voc temperature coefficient in %/°C (e.g. -0.29)")
    vmpStcV: float = Field(..., gt=0, description="Maximum-power-point voltage at STC (V)")
    vmpCoeffPctPerC: Optional[float] = Field(
        default=None,
        description="Vmp temperature coefficient in %/°C. If omitted, vocCoeffPctPerC is reused.",
    )
    pmaxStcW: float = Field(..., gt=0, description="Maximum power at STC (W)")
    pmaxCoeffPctPerC: float = Field(..., description="Pmax temperature coefficient in %/°C (e.g. -0.34)")
    inverterMaxInputV: float = Field(..., gt=0, description="Inverter maximum DC input voltage (V)")
    inverterMpptOptimalV: float = Field(..., gt=0, description="Inverter most-efficient MPPT operating voltage (V)")
    temperaturesC: Optional[List[float]] = Field(
        default=None,
        description="Ambient temperatures to evaluate (°C). Defaults to [-10, 25, 60].",
    )


class PanelThermalResponse(FlexibleModel):
    inputs: Dict[str, Any] = Field(default_factory=dict)
    scenarios: List[Dict[str, Any]] = Field(default_factory=list)
    coldestScenario: Dict[str, Any] = Field(default_factory=dict)
    hottestScenario: Dict[str, Any] = Field(default_factory=dict)
    stringSizing: Dict[str, Any] = Field(default_factory=dict)
    realisticPeakPower: Dict[str, Any] = Field(default_factory=dict)
