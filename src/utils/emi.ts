/**
 * EMI Calculation Utilities
 *
 * Supports:
 * 1. Reducing Balance (standard) — used by all major banks (SBI, HDFC, ICICI, etc.)
 * 2. Flat Rate — used by some NBFCs for car/personal loans
 * 3. Prepayment modeling — annual or one-time, with tenure/EMI reduction
 * 4. Affordability checks — EMI as % of monthly income
 * 5. Fee-aware total cost — includes processing fees and insurance
 */

// ─── Types ───

export interface EmiResult {
  monthlyEmi: number;
  totalInterest: number;
  totalAmount: number;
}

export interface AmortizationRow {
  month: number;
  year: number;
  openingBalance: number;
  emi: number;
  principal: number;
  interest: number;
  closingBalance: number;
}

export interface YearSummary {
  year: number;
  totalPrincipal: number;
  totalInterest: number;
  totalEmi: number;
  closingBalance: number;
  months: AmortizationRow[];
}

export interface PrepaymentResult {
  originalTenureMonths: number;
  newTenureMonths: number;
  monthsSaved: number;
  originalTotalInterest: number;
  newTotalInterest: number;
  interestSaved: number;
  newEmi: number;
}

export interface AffordabilityResult {
  emiToIncomeRatio: number;
  level: 'safe' | 'stretched' | 'risky';
  message: string;
}

export interface ScenarioData {
  id: string;
  label: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  method: 'reducing' | 'flat';
  monthlyIncome: number;
  processingFeePct: number;
  result: EmiResult;
  affordability: AffordabilityResult | null;
  trueCost: number;
  payoffDate: string;
}

export type LoanType = 'home' | 'car' | 'personal';

export interface LoanPreset {
  type: LoanType;
  label: string;
  icon: string;
  principal: number;
  rate: number;
  tenureYears: number;
  rateHint: string;
}

// ─── Loan Type Presets ───

export const LOAN_PRESETS: Record<LoanType, LoanPreset> = {
  home: {
    type: 'home',
    label: 'Home Loan',
    icon: '🏠',
    principal: 5000000,
    rate: 8.5,
    tenureYears: 20,
    rateHint: 'Most home loans: 8–10%',
  },
  car: {
    type: 'car',
    label: 'Car Loan',
    icon: '🚗',
    principal: 800000,
    rate: 9.5,
    tenureYears: 5,
    rateHint: 'Car loans: 9–12%',
  },
  personal: {
    type: 'personal',
    label: 'Personal Loan',
    icon: '💳',
    principal: 300000,
    rate: 14.0,
    tenureYears: 3,
    rateHint: 'Personal loans: 11–18%',
  },
};

// ─── EMI Formulas ───

/**
 * Reducing Balance EMI Formula:
 *
 *   EMI = [P × R × (1 + R)^N] / [(1 + R)^N - 1]
 *
 * Where:
 *   P = Principal loan amount
 *   R = Monthly interest rate = (annual rate / 12 / 100)
 *   N = Tenure in months
 *
 * This is the standard method used by most banks worldwide.
 * Interest is calculated on the outstanding (reducing) principal each month.
 */
export function calculateReducingBalanceEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number
): EmiResult {
  if (principal <= 0 || tenureMonths <= 0) {
    return { monthlyEmi: 0, totalInterest: 0, totalAmount: 0 };
  }
  if (annualRate === 0) {
    const monthlyEmi = principal / tenureMonths;
    return { monthlyEmi, totalInterest: 0, totalAmount: principal };
  }

  const R = annualRate / 12 / 100;
  const N = tenureMonths;
  const onePlusRpowN = Math.pow(1 + R, N);
  const monthlyEmi = (principal * R * onePlusRpowN) / (onePlusRpowN - 1);
  const totalAmount = monthlyEmi * N;
  const totalInterest = totalAmount - principal;

  return { monthlyEmi, totalInterest, totalAmount };
}

/**
 * Flat Rate EMI Formula:
 *
 *   EMI = (P + P × AnnualRate/100 × Years) / (Years × 12)
 *
 * Interest is calculated on the full principal for the entire tenure.
 * Results in a higher effective interest rate vs. reducing balance.
 */
export function calculateFlatRateEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number
): EmiResult {
  if (principal <= 0 || tenureMonths <= 0) {
    return { monthlyEmi: 0, totalInterest: 0, totalAmount: 0 };
  }
  const years = tenureMonths / 12;
  const totalInterest = principal * (annualRate / 100) * years;
  const totalAmount = principal + totalInterest;
  const monthlyEmi = totalAmount / tenureMonths;

  return { monthlyEmi, totalInterest, totalAmount };
}

/**
 * Calculate EMI using the specified method.
 */
export function calculateEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  method: 'reducing' | 'flat' = 'reducing'
): EmiResult {
  return method === 'reducing'
    ? calculateReducingBalanceEmi(principal, annualRate, tenureMonths)
    : calculateFlatRateEmi(principal, annualRate, tenureMonths);
}

// ─── Amortization Schedule ───

/**
 * Generate a month-by-month amortization schedule, grouped by year.
 */
export function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  method: 'reducing' | 'flat' = 'reducing'
): AmortizationRow[] {
  if (principal <= 0 || tenureMonths <= 0) return [];

  const schedule: AmortizationRow[] = [];

  if (method === 'reducing') {
    const result = calculateReducingBalanceEmi(principal, annualRate, tenureMonths);
    const R = annualRate / 12 / 100;
    let balance = principal;

    for (let month = 1; month <= tenureMonths; month++) {
      const interest = balance * R;
      const principalPart = result.monthlyEmi - interest;
      const closingBalance = Math.max(0, balance - principalPart);

      schedule.push({
        month,
        year: Math.ceil(month / 12),
        openingBalance: balance,
        emi: result.monthlyEmi,
        principal: principalPart,
        interest,
        closingBalance,
      });
      balance = closingBalance;
    }
  } else {
    const result = calculateFlatRateEmi(principal, annualRate, tenureMonths);
    const monthlyInterest = result.totalInterest / tenureMonths;
    const monthlyPrincipal = principal / tenureMonths;
    let balance = principal;

    for (let month = 1; month <= tenureMonths; month++) {
      const closingBalance = Math.max(0, balance - monthlyPrincipal);
      schedule.push({
        month,
        year: Math.ceil(month / 12),
        openingBalance: balance,
        emi: result.monthlyEmi,
        principal: monthlyPrincipal,
        interest: monthlyInterest,
        closingBalance,
      });
      balance = closingBalance;
    }
  }

  return schedule;
}

/**
 * Group amortization rows by year, with per-year summaries.
 */
export function groupByYear(schedule: AmortizationRow[]): YearSummary[] {
  const years: YearSummary[] = [];
  let currentYear: YearSummary | null = null;

  for (const row of schedule) {
    if (!currentYear || currentYear.year !== row.year) {
      if (currentYear) years.push(currentYear);
      currentYear = {
        year: row.year,
        totalPrincipal: 0,
        totalInterest: 0,
        totalEmi: 0,
        closingBalance: 0,
        months: [],
      };
    }
    currentYear.totalPrincipal += row.principal;
    currentYear.totalInterest += row.interest;
    currentYear.totalEmi += row.emi;
    currentYear.closingBalance = row.closingBalance;
    currentYear.months.push(row);
  }
  if (currentYear) years.push(currentYear);

  return years;
}

// ─── Prepayment Modeling ───

/**
 * Calculate the impact of annual prepayments on a reducing balance loan.
 *
 * @param principal - Loan amount
 * @param annualRate - Annual interest rate (%)
 * @param tenureMonths - Original tenure in months
 * @param prepaymentAmount - Amount prepaid each year
 * @param startFromYear - Year from which prepayments begin (1-indexed)
 * @param effect - Whether to reduce tenure or reduce EMI
 */
export function calculatePrepaymentImpact(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  prepaymentAmount: number,
  startFromYear: number = 1,
  effect: 'reduce-tenure' | 'reduce-emi' = 'reduce-tenure'
): PrepaymentResult {
  const original = calculateReducingBalanceEmi(principal, annualRate, tenureMonths);
  const R = annualRate / 12 / 100;

  if (R === 0 || prepaymentAmount <= 0) {
    return {
      originalTenureMonths: tenureMonths,
      newTenureMonths: tenureMonths,
      monthsSaved: 0,
      originalTotalInterest: original.totalInterest,
      newTotalInterest: original.totalInterest,
      interestSaved: 0,
      newEmi: original.monthlyEmi,
    };
  }

  let balance = principal;
  let emi = original.monthlyEmi;
  let totalInterestPaid = 0;
  let monthCount = 0;

  for (let month = 1; month <= tenureMonths * 2 && balance > 0.01; month++) {
    const interest = balance * R;
    const principalPart = Math.min(emi - interest, balance);
    balance = Math.max(0, balance - principalPart);
    totalInterestPaid += interest;
    monthCount = month;

    // Apply annual prepayment at the end of each 12-month cycle
    if (month % 12 === 0) {
      const year = month / 12;
      if (year >= startFromYear && balance > 0) {
        const prepay = Math.min(prepaymentAmount, balance);
        balance -= prepay;

        if (effect === 'reduce-emi' && balance > 0) {
          // Recalculate EMI for remaining balance and remaining months
          const remainingMonths = tenureMonths - month;
          if (remainingMonths > 0) {
            const newResult = calculateReducingBalanceEmi(balance, annualRate, remainingMonths);
            emi = newResult.monthlyEmi;
          }
        }
      }
    }

    if (balance <= 0.01) break;
  }

  return {
    originalTenureMonths: tenureMonths,
    newTenureMonths: monthCount,
    monthsSaved: tenureMonths - monthCount,
    originalTotalInterest: original.totalInterest,
    newTotalInterest: totalInterestPaid,
    interestSaved: original.totalInterest - totalInterestPaid,
    newEmi: emi,
  };
}

// ─── Affordability ───

/**
 * Check EMI affordability based on monthly income.
 * Uses standard banking thresholds:
 *   < 30% = safe, 30-40% = stretched, > 40% = risky
 */
export function checkAffordability(
  monthlyEmi: number,
  monthlyIncome: number
): AffordabilityResult {
  if (monthlyIncome <= 0) {
    return { emiToIncomeRatio: 0, level: 'safe', message: '' };
  }

  const ratio = (monthlyEmi / monthlyIncome) * 100;

  if (ratio <= 30) {
    return {
      emiToIncomeRatio: ratio,
      level: 'safe',
      message: `Your EMI is ${ratio.toFixed(0)}% of your income. Banks approve up to 40%, but keeping it under 30% leaves room for emergencies.`,
    };
  } else if (ratio <= 40) {
    return {
      emiToIncomeRatio: ratio,
      level: 'stretched',
      message: `Your EMI is ${ratio.toFixed(0)}% of your income. This is within most banks' approval limits, but leaves less room for savings. Consider a longer tenure or smaller loan.`,
    };
  } else {
    return {
      emiToIncomeRatio: ratio,
      level: 'risky',
      message: `Your EMI is ${ratio.toFixed(0)}% of your income. Most banks will reject this application. Try reducing the loan amount, extending the tenure, or increasing your down payment.`,
    };
  }
}

// ─── Fee-Aware Cost ───

/**
 * Calculate the true total cost including processing fees and insurance.
 */
export function calculateTrueCost(
  totalAmount: number,
  principal: number,
  processingFeePct: number = 0,
  insuranceTotal: number = 0
): number {
  const processingFee = principal * (processingFeePct / 100);
  return totalAmount + processingFee + insuranceTotal;
}

/**
 * Get a human-readable payoff date from today + N months.
 */
export function getPayoffDate(tenureMonths: number): string {
  const now = new Date();
  const payoff = new Date(now.getFullYear(), now.getMonth() + tenureMonths, 1);
  return payoff.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Formatting ───

/**
 * Format a number as currency string.
 */
export function formatCurrency(amount: number, currency: 'INR' | 'USD'): string {
  if (currency === 'INR') {
    return '₹' + formatIndianNumber(amount);
  }
  return '$' + Math.round(amount).toLocaleString('en-US');
}

/**
 * Format number in Indian numbering system (lakhs, crores).
 * Example: 1234567 → 12,34,567
 */
function formatIndianNumber(num: number): string {
  const rounded = Math.round(num);
  const str = rounded.toString();
  if (str.length <= 3) return str;

  let lastThree = str.substring(str.length - 3);
  const otherNumbers = str.substring(0, str.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
}

/**
 * Format months into a readable "X years Y months" string.
 */
export function formatTenure(months: number): string {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} yr${years !== 1 ? 's' : ''} ${remainingMonths} mo`;
}
