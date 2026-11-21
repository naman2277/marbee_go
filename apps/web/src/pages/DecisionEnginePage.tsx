import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Brain,
  CheckCircle2,
  Cpu,
  Edit2,
  Play,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  User,
  Wand2,
  X,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchDecisionRules,
  saveDecisionRules,
  deleteDecisionRule,
  clearAllDecisionRules,
  evaluateNextBestAction,
  calculateLiveRfmClusters,
  type DecisionPolicyRule,
  type DecisionEvaluationResult,
  type EligibilityCondition,
  type DecisionGoal,
} from '@/lib/decision-engine';
import { fetchOffers } from '@/lib/offers';
import { fetchCouponCampaigns } from '@/lib/coupons';
import { fetchCustomers, getCustomerDisplayName } from '@/lib/customers';
import { formatNumber } from '@/lib/utils';

export function DecisionEnginePage() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'nba_rules' | 'rfm_modeling' | 'ai_sandbox'>('nba_rules');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Policy Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DecisionPolicyRule | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [ruleName, setRuleName] = useState('');
  const [rulePriority, setRulePriority] = useState(1);
  const [ruleGoal, setRuleGoal] = useState<DecisionGoal>('maximize_conversion');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [ruleChannel, setRuleChannel] = useState<DecisionPolicyRule['channel']>('all');
  const [valueWeight, setValueWeight] = useState(0.4);
  const [propensityWeight, setPropensityWeight] = useState(0.35);
  const [marginWeight, setMarginWeight] = useState(0.2);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [conditions, setConditions] = useState<EligibilityCondition[]>([
    { id: 'c_init1', field: 'cart_value', operator: 'greater_than', value: 1000 },
    { id: 'c_init2', field: 'rfm_segment', operator: 'in_list', value: ['Champions', 'Loyal Customers', 'Potential Loyalists'] },
  ]);

  // Simulation Context
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [simName, setSimName] = useState('');
  const [simCart, setSimCart] = useState(1500);
  const [simTier, setSimTier] = useState('Gold');
  const [simChannel, setSimChannel] = useState('whatsapp');
  const [simRfm, setSimRfm] = useState('Champions');
  const [simInactivity, setSimInactivity] = useState(10);
  const [simPropensity, setSimPropensity] = useState(0.85);

  const [simulationResult, setSimulationResult] = useState<DecisionEvaluationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const { data: rules = [], isLoading, refetch } = useQuery({
    queryKey: ['decision-engine-rules', tenantId, environment],
    queryFn: () => fetchDecisionRules(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: offers = [] } = useQuery({
    queryKey: ['loyalty-offers', tenantId, environment],
    queryFn: () => fetchOffers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: coupons = [] } = useQuery({
    queryKey: ['coupon-campaigns', tenantId, environment],
    queryFn: () => fetchCouponCampaigns(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', tenantId, environment],
    queryFn: () => fetchCustomers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  // Calculate live dynamic RFM clusters from real customer profiles
  const rfmClusters = useMemo(() => calculateLiveRfmClusters(customers), [customers]);

  // If customers are loaded and simName is empty, initialize simulation with first real customer
  useEffect(() => {
    if (customers.length > 0 && !simName) {
      const first = customers[0];
      setSimName(getCustomerDisplayName(first));
      setSelectedCustomerId(first.id);
    }
  }, [customers, simName]);

  const handleSelectRealCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setSimName(getCustomerDisplayName(found));
    }
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const result = evaluateNextBestAction(rules, {
        customer_id: selectedCustomerId,
        customer_name: simName,
        cart_value: simCart,
        tier: simTier,
        channel: simChannel,
        placement: 'checkout',
        rfm_segment: simRfm,
        inactivity_days: simInactivity,
        propensity_score: simPropensity,
      });
      setSimulationResult(result);
      setIsSimulating(false);
      showToast('Decisioning arbitration evaluated!');
    }, 250);
  };

  // Run initial simulation if rules exist
  useEffect(() => {
    if (!simulationResult && rules.length > 0) {
      const initRes = evaluateNextBestAction(rules, {
        customer_id: selectedCustomerId,
        customer_name: simName || 'Customer',
        cart_value: simCart,
        tier: simTier,
        channel: simChannel,
        placement: 'checkout',
        rfm_segment: simRfm,
        inactivity_days: simInactivity,
        propensity_score: simPropensity,
      });
      setSimulationResult(initRes);
    }
  }, [rules, simName]);

  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      let offerName = 'Promotional Reward';
      let offerType = 'percentage';
      let discountDisplay = '20% OFF';

      const foundOffer = offers.find((o) => o.id === selectedOfferId);
      if (foundOffer) {
        offerName = foundOffer.name;
        offerType = foundOffer.offerType;
        discountDisplay = foundOffer.offerType === 'discount_percent' ? `${foundOffer.offerValue}% OFF` : `₹${foundOffer.offerValue} OFF`;
      } else {
        const foundCoupon = coupons.find((c) => c.id === selectedOfferId);
        if (foundCoupon) {
          offerName = foundCoupon.name;
          offerType = foundCoupon.discount_type;
          discountDisplay = foundCoupon.discount_type === 'percentage' ? `${foundCoupon.discount_value}% OFF` : `₹${foundCoupon.discount_value} OFF`;
        }
      }

      const ruleObj: DecisionPolicyRule = {
        id: editingRule?.id || `rule_${Date.now()}`,
        name: ruleName.trim(),
        priority: Number(rulePriority),
        offer_id: selectedOfferId || (offers[0]?.id || coupons[0]?.id || 'custom_reward'),
        offer_name: offerName,
        offer_type: offerType,
        discount_display: discountDisplay,
        channel: ruleChannel,
        goal: ruleGoal,
        eligibility_conditions: conditions,
        value_weight: Number(valueWeight),
        propensity_weight: Number(propensityWeight),
        margin_weight: Number(marginWeight),
        fatigue_penalty_weight: 0.1,
        cooldown_days: Number(cooldownDays),
        status: 'active',
        impressions: editingRule?.impressions || 0,
        conversions: editingRule?.conversions || 0,
        revenue_attributed: editingRule?.revenue_attributed || 0,
      };

      const updated = editingRule
        ? rules.map((r) => (r.id === editingRule.id ? ruleObj : r))
        : [ruleObj, ...rules];

      return await saveDecisionRules(tenantId, environment, updated);
    },
    onSuccess: () => {
      setEditorOpen(false);
      setEditingRule(null);
      showToast(`Saved Decision Policy "${ruleName}"`);
      void queryClient.invalidateQueries({ queryKey: ['decision-engine-rules', tenantId, environment] });
      refetch();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return await deleteDecisionRule(tenantId, environment, ruleId);
    },
    onSuccess: () => {
      showToast('Deleted decision policy');
      void queryClient.invalidateQueries({ queryKey: ['decision-engine-rules', tenantId, environment] });
      refetch();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await clearAllDecisionRules(tenantId, environment);
    },
    onSuccess: () => {
      setConfirmClearOpen(false);
      setSimulationResult(null);
      showToast('Cleared all decision policies');
      void queryClient.invalidateQueries({ queryKey: ['decision-engine-rules', tenantId, environment] });
      refetch();
    },
  });

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleName('');
    setRulePriority(rules.length + 1);
    setRuleGoal('maximize_conversion');
    setSelectedOfferId(offers[0]?.id || coupons[0]?.id || '');
    setRuleChannel('all');
    setValueWeight(0.4);
    setPropensityWeight(0.35);
    setMarginWeight(0.2);
    setCooldownDays(7);
    setConditions([
      { id: 'c1', field: 'cart_value', operator: 'greater_than', value: 1000 },
      { id: 'c2', field: 'rfm_segment', operator: 'in_list', value: ['Champions', 'Loyal Customers', 'Potential Loyalists'] },
    ]);
    setEditorOpen(true);
  };

  const openEditRule = (rule: DecisionPolicyRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRulePriority(rule.priority);
    setRuleGoal(rule.goal);
    setSelectedOfferId(rule.offer_id);
    setRuleChannel(rule.channel);
    setValueWeight(rule.value_weight);
    setPropensityWeight(rule.propensity_weight);
    setMarginWeight(rule.margin_weight);
    setCooldownDays(rule.cooldown_days);
    setConditions(rule.eligibility_conditions);
    setEditorOpen(true);
  };

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { id: `c_${Date.now()}`, field: 'inactivity_days', operator: 'greater_than', value: 14 },
    ]);
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCondition = (id: string, patch: Partial<EligibilityCondition>) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification - Positioned at bottom right to prevent header overlap */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-purple-300/40 bg-slate-950/95 backdrop-blur-md px-5 py-3.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5 ring-1 ring-white/10">
          <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Futuristic Header */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/80 bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-6 sm:p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300 backdrop-blur-md">
              <Brain className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>Real-Time Next Best Action (NBA) Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>Decision Engine & Offer Arbitration</span>
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-purple-200/80 leading-relaxed">
              Multi-objective arbitration, eligibility qualification matrices, and dynamic RFM prediction calculated live from your database.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            {rules.length > 0 && (
              <Button
                onClick={() => setConfirmClearOpen(true)}
                variant="ghost"
                className="text-rose-300 hover:bg-rose-950/40 font-bold text-xs h-9 px-3.5 rounded-xl border border-rose-500/30"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear All
              </Button>
            )}
            <Link to="/settings/ai-engine">
              <Button variant="secondary" className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs shadow-2xs h-9 px-3.5 rounded-xl border border-white/20">
                <Cpu className="mr-1.5 h-3.5 w-3.5 text-purple-300" />
                AI Models
              </Button>
            </Link>
            <Button
              onClick={openCreateRule}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg h-9 px-4 rounded-xl ring-1 ring-white/20"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New NBA Policy
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2 overflow-x-auto">
        {[
          { id: 'nba_rules', label: `Next Best Action Policies (${rules.length})`, icon: SlidersHorizontal },
          { id: 'rfm_modeling', label: `Predictive RFM Clusters (${rfmClusters.length})`, icon: Target },
          { id: 'ai_sandbox', label: 'AI Intent & Simulation Sandbox', icon: Wand2 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: NBA POLICIES & ARBITRATION RULES */}
      {activeTab === 'nba_rules' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Executive Formula Banner */}
          <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-950 via-slate-950 to-indigo-950 p-6 text-white shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/20 backdrop-blur-xs text-purple-300 ring-1 ring-purple-400/40">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200">
                    Real-Time Multi-Objective Arbitration
                  </h3>
                  <p className="text-xs text-slate-300">
                    Evaluates Customer Value, Purchase Propensity, and Gross Margin with fatigue cool-down suppression.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-mono text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                ● Live Engine Active
              </span>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xs">
              <pre className="font-mono text-xs text-purple-200 whitespace-pre-wrap">
                Score = (W_value × Cart Value) + (W_propensity × Intent Score) + (W_margin × Gross Margin) - Fatigue Penalty
              </pre>
            </div>
          </div>

          {/* Rules List */}
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 font-medium animate-pulse">
              Loading decisioning policies…
            </div>
          ) : rules.length > 0 ? (
            <div className="grid gap-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4 hover:border-purple-300 hover:shadow-md transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold text-xs">
                        #{rule.priority}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-slate-900">{rule.name}</h4>
                          <span className="rounded-lg bg-purple-50 px-2 py-0.5 font-mono text-xs font-black text-purple-700 border border-purple-200">
                            {rule.discount_display}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800 uppercase">
                            {rule.goal.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Linked Reward: <span className="font-semibold text-slate-800">{rule.offer_name}</span> · Channel: <span className="uppercase font-mono font-bold text-slate-700">{rule.channel}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-800">{formatNumber(rule.impressions)} Exposures</p>
                        <p className="text-[10px] text-emerald-600 font-bold">₹{formatNumber(rule.revenue_attributed)} Revenue</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditRule(rule)}
                          className="h-8 px-2.5 text-xs font-bold bg-white rounded-xl shadow-2xs"
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <button
                          type="button"
                          onClick={() => deleteRuleMutation.mutate(rule.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Delete policy"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Eligibility Matrix Conditions */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Qualification Matrix ({rule.eligibility_conditions.length} Rules Must Pass):
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {rule.eligibility_conditions.map((cond) => (
                        <span
                          key={cond.id}
                          className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-200 shadow-2xs"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                          <span className="font-bold">{cond.field}:</span>{' '}
                          <span className="text-slate-500">{cond.operator}</span>{' '}
                          <span className="font-mono text-purple-700 font-bold">
                            {Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Weights Bar */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>Value Weight: <strong className="text-slate-800">{rule.value_weight * 100}%</strong></span>
                      <span>Propensity Weight: <strong className="text-slate-800">{rule.propensity_weight * 100}%</strong></span>
                      <span>Margin Weight: <strong className="text-slate-800">{rule.margin_weight * 100}%</strong></span>
                      <span>Cooldown: <strong className="text-slate-800">{rule.cooldown_days} days</strong></span>
                    </div>
                    <span
                      className="text-[11px] text-purple-700 font-bold cursor-pointer hover:underline"
                      onClick={() => {
                        setActiveTab('ai_sandbox');
                        handleRunSimulation();
                      }}
                    >
                      Simulate Rule →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center space-y-3">
              <Brain className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900">No Decisioning Policies Configured</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create your first Next Best Action policy to arbitrate personalized offers and coupons for customer audience journeys.
              </p>
              <Button onClick={openCreateRule} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create NBA Policy
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: PREDICTIVE RFM MODELING */}
      {activeTab === 'rfm_modeling' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 p-5 space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" />
              <span>Live Predictive RFM (Recency, Frequency, Monetary) Customer Segmentation</span>
            </h3>
            <p className="text-xs text-slate-600">
              Dynamically computed from your tenant's actual {customers.length} customer profiles based on profile age, order frequency, and engagement traits.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rfmClusters.map((cluster) => (
              <div
                key={cluster.id}
                className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4 hover:border-indigo-300 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${cluster.badge_color}`}>
                      {cluster.name}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-2">
                      {cluster.customer_count} Customers ({cluster.percentage}%)
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[11px] font-black bg-slate-100 px-2 py-1 rounded-xl text-slate-700">
                    <span>R:{cluster.recency_score}</span>
                    <span>F:{cluster.frequency_score}</span>
                    <span>M:{cluster.monetary_score}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{cluster.description}</p>

                <div className="rounded-2xl bg-slate-50 p-3 space-y-1 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recommended Action:</p>
                  <p className="text-slate-800 font-medium">{cluster.recommended_action}</p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <span className="text-[10px] font-bold uppercase text-purple-700">AI Suggested Offer:</span>
                  <p className="text-xs font-bold text-purple-950 mt-0.5">{cluster.suggested_offer_type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AI INTENT & DECISION SIMULATION SANDBOX */}
      {activeTab === 'ai_sandbox' && (
        <div className="grid gap-6 lg:grid-cols-12 animate-in fade-in">
          {/* Left Column: Real Customer Selector & Context Input */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-purple-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Customer Profile Simulation
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Live Profiles</span>
              </div>

              <div className="space-y-3">
                {/* Real Customer Selector */}
                {customers.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Pick Existing Customer</span>
                      <span className="text-[10px] text-slate-400 font-normal">{customers.length} profiles</span>
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => handleSelectRealCustomer(e.target.value)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          👤 {getCustomerDisplayName(c)} ({c.email || c.mobile || 'No Contact'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Customer Name / Identifier</label>
                  <input
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
                    placeholder="Enter customer name..."
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Cart Value (₹)</label>
                    <input
                      type="number"
                      value={simCart}
                      onChange={(e) => setSimCart(Number(e.target.value))}
                      className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Loyalty Tier</label>
                    <select
                      value={simTier}
                      onChange={(e) => setSimTier(e.target.value)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                    >
                      <option value="Bronze">Bronze Member</option>
                      <option value="Silver">Silver Member</option>
                      <option value="Gold">Gold VIP</option>
                      <option value="Platinum">Platinum Elite</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Channel</label>
                    <select
                      value={simChannel}
                      onChange={(e) => setSimChannel(e.target.value)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                    >
                      <option value="any">Any / Omni-channel</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="checkout">Checkout Web</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">RFM Cluster</label>
                    <select
                      value={simRfm}
                      onChange={(e) => setSimRfm(e.target.value)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                    >
                      <option value="Champions">Champions</option>
                      <option value="Loyal Customers">Loyal Customers</option>
                      <option value="Potential Loyalists">Potential Loyalists</option>
                      <option value="At Risk">At Risk / Churn Warning</option>
                      <option value="Hibernating">Hibernating</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Inactivity (Days)</label>
                    <input
                      type="number"
                      value={simInactivity}
                      onChange={(e) => setSimInactivity(Number(e.target.value))}
                      className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Propensity (0.0 - 1.0)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={simPropensity}
                      onChange={(e) => setSimPropensity(Number(e.target.value))}
                      className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-10 rounded-xl shadow-xs mt-2"
                >
                  <Play className={`mr-1.5 h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                  {isSimulating ? 'Evaluating Arbitration Matrix…' : 'Run Real-Time Decision Evaluation'}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Winning Action & AI Insights */}
          <div className="space-y-4 lg:col-span-7">
            {simulationResult ? (
              <div className="space-y-4">
                {/* Winning NBA Banner */}
                {simulationResult.winning_rule ? (
                  <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-slate-950 to-teal-950 p-6 text-white shadow-xl space-y-4 animate-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-mono text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40">
                        ★ Selected Next Best Action (NBA)
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-300">
                        Arbitration Score: {simulationResult.arbitration_score} pts
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-white">{simulationResult.winning_rule.name}</h3>
                      <p className="text-xs text-slate-300">
                        Offer: <strong className="text-emerald-300">{simulationResult.winning_rule.offer_name}</strong> ({simulationResult.winning_rule.discount_display})
                      </p>
                    </div>

                    {/* AI Intent Insights Box */}
                    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xs space-y-2 border border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                          AI Intent Understanding:
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.2 text-[9px] font-black uppercase ${
                            simulationResult.ai_intent_insights.churn_risk_level === 'critical'
                              ? 'bg-rose-500/30 text-rose-300'
                              : simulationResult.ai_intent_insights.churn_risk_level === 'high'
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {simulationResult.ai_intent_insights.churn_risk_level} Churn Risk
                        </span>
                      </div>

                      <p className="text-xs text-slate-200 leading-relaxed">
                        {simulationResult.ai_intent_insights.user_intent}
                      </p>

                      <p className="text-[11px] text-purple-200 font-medium">
                        💡 {simulationResult.ai_intent_insights.suggested_messaging}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Card className="p-8 text-center space-y-2">
                    <AlertCircle className="mx-auto h-8 w-8 text-amber-500" />
                    <p className="text-xs font-bold text-slate-800">No Offer Qualified Under Current Context</p>
                    <p className="text-[11px] text-slate-500">
                      {rules.length === 0
                        ? 'No policies are currently configured in the NBA Policies tab.'
                        : 'None of the active rules passed the eligibility filter thresholds.'}
                    </p>
                  </Card>
                )}

                {/* Qualification Breakdown Table */}
                <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Arbitration Ranking Trace ({simulationResult.qualified_rules.length} Qualified / {simulationResult.disqualified_rules.length} Disqualified)
                  </h4>

                  <div className="space-y-2">
                    {simulationResult.qualified_rules.map(({ rule, score, breakdown }) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{rule.name}</span>
                            <span className="rounded bg-purple-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-purple-800">
                              {rule.discount_display}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Val: {breakdown.value_score} | Prop: {breakdown.propensity_score} | Marg: {breakdown.margin_score} | Fatig: -{breakdown.fatigue_penalty}
                          </p>
                        </div>
                        <span className="font-mono font-black text-purple-700 text-sm">{score} pts</span>
                      </div>
                    ))}

                    {simulationResult.disqualified_rules.map(({ rule, failed_reason }) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-xs opacity-75"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-700">{rule.name}</span>
                          <p className="text-[10px] text-rose-700 font-medium">Failed: {failed_reason}</p>
                        </div>
                        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-800">
                          Disqualified
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Card className="p-12 text-center text-slate-400">
                Click "Run Real-Time Decision Evaluation" to test context.
              </Card>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR ALL MODAL */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Clear All Decision Policies?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This will permanently delete all {rules.length} decision policies from this workspace.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmClearOpen(false)} className="font-bold text-xs h-9 px-4 rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
              >
                {clearAllMutation.isPending ? 'Clearing…' : 'Yes, Delete All'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POLICY CREATOR / EDITOR MODAL */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Brain className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingRule ? 'Edit Next Best Action Policy' : 'Create Next Best Action Policy'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configure eligibility matrix rules, arbitration weights, and linked reward incentives.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Policy Name *</label>
                  <input
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. High Value Cart Conversion Policy"
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-purple-400 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Strategic Goal</label>
                  <select
                    value={ruleGoal}
                    onChange={(e) => setRuleGoal(e.target.value as DecisionGoal)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                  >
                    <option value="maximize_conversion">Maximize Conversion Rate</option>
                    <option value="maximize_margin">Maximize Gross Margin</option>
                    <option value="churn_prevention">Churn Defense & Retention</option>
                    <option value="customer_reactivation">Customer Reactivation</option>
                    <option value="balanced_growth">Balanced Exploration vs Exploitation</option>
                  </select>
                </div>
              </div>

              {/* Linked Offer / Coupon Reward */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Linked Offer / Coupon</label>
                  <select
                    value={selectedOfferId}
                    onChange={(e) => setSelectedOfferId(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                  >
                    <optgroup label="Dynamic Offers">
                      {offers.map((o) => (
                        <option key={o.id} value={o.id}>
                          🎁 {o.name} ({o.offerType === 'discount_percent' ? `${o.offerValue}%` : `₹${o.offerValue}`})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Coupons & Vouchers">
                      {coupons.map((c) => (
                        <option key={c.id} value={c.id}>
                          🏷️ {c.name} ({c.discount_value}{c.discount_type === 'percentage' ? '%' : '₹'})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Channel</label>
                  <select
                    value={ruleChannel}
                    onChange={(e) => setRuleChannel(e.target.value as DecisionPolicyRule['channel'])}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                  >
                    <option value="all">All Channels (Omni)</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="checkout">Checkout Web</option>
                    <option value="sms">SMS</option>
                    <option value="web_push">Web Push</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Priority Order (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={rulePriority}
                    onChange={(e) => setRulePriority(Number(e.target.value))}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs"
                  />
                </div>
              </div>

              {/* Dynamic Eligibility Conditions Matrix */}
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Qualification Matrix (Audience Eligibility Conditions):
                  </span>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="text-[11px] font-bold text-purple-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Condition
                  </button>
                </div>

                <div className="space-y-2">
                  {conditions.map((cond) => (
                    <div key={cond.id} className="flex items-center gap-2">
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(cond.id, { field: e.target.value as EligibilityCondition['field'] })}
                        className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium w-40"
                      >
                        <option value="cart_value">Cart Value (₹)</option>
                        <option value="rfm_segment">RFM Segment</option>
                        <option value="inactivity_days">Inactivity (Days)</option>
                        <option value="tier">Loyalty Tier</option>
                      </select>

                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(cond.id, { operator: e.target.value as EligibilityCondition['operator'] })}
                        className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium w-36"
                      >
                        <option value="greater_than">&gt; Greater Than</option>
                        <option value="less_than">&lt; Less Than</option>
                        <option value="equals">= Equals</option>
                        <option value="in_list">In List</option>
                      </select>

                      <input
                        value={Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value)}
                        onChange={(e) => {
                          const val = cond.operator === 'in_list' ? e.target.value.split(',').map((s) => s.trim()) : e.target.value;
                          updateCondition(cond.id, { value: val });
                        }}
                        placeholder="Value..."
                        className="h-8 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                      />

                      <button
                        type="button"
                        onClick={() => removeCondition(cond.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Multi-Objective Arbitration Weights */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Value Weight</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={valueWeight}
                    onChange={(e) => setValueWeight(Number(e.target.value))}
                    className="h-8 w-full rounded-xl border border-slate-200 px-2 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Propensity Wt</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={propensityWeight}
                    onChange={(e) => setPropensityWeight(Number(e.target.value))}
                    className="h-8 w-full rounded-xl border border-slate-200 px-2 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Margin Wt</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={marginWeight}
                    onChange={(e) => setMarginWeight(Number(e.target.value))}
                    className="h-8 w-full rounded-xl border border-slate-200 px-2 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Cooldown (d)</label>
                  <input
                    type="number"
                    min="0"
                    value={cooldownDays}
                    onChange={(e) => setCooldownDays(Number(e.target.value))}
                    className="h-8 w-full rounded-xl border border-slate-200 px-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="ghost"
                onClick={() => setEditorOpen(false)}
                className="font-bold text-xs h-9 px-4 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveRuleMutation.mutate()}
                disabled={!ruleName.trim() || saveRuleMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
              >
                {saveRuleMutation.isPending ? 'Saving…' : 'Save Policy'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
