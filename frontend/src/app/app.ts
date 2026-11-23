import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ExpenseService, Transaction } from './expense.service';
import Chart from 'chart.js/auto';

interface QuickPreset {
  label: string;
  category: string;
  slot: 'morning' | 'afternoon' | 'evening' | 'night';
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private expenseService = inject(ExpenseService);

  currentStep: 'auth' | 'setup' | 'dashboard' = 'auth';

  realTimeToday = new Date().toLocaleDateString('en-CA');
  realTimeMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

  isRegisterMode = false;
  currentUserName = '';
  authError = '';
  authForm = { name: '', email: '', password: '' };

  setupForm = {
    month: this.realTimeMonth,
    income: 0
  };
  setupError = '';

  activeDate = this.realTimeToday;
  showAllMonthExpenses = false;
  transactions: Transaction[] = [];
  expenseList: Transaction[] = [];
  displayedExpenses: Transaction[] = [];
  dailyTotal = 0;
  totalIncome = 0;
  totalExpense = 0;
  balance = 0;
  spentPercentage = 0;
  editingId: number | null = null;
  toastMessage = '';
  chart: Chart | null = null;

  expenseCategories = ['Food', 'Housing', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Health', 'Other'];

  allPresets: QuickPreset[] = [
    { label: 'Breakfast', category: 'Food', slot: 'morning' },
    { label: 'Tea', category: 'Food', slot: 'morning' },
    { label: 'Morning Snack', category: 'Food', slot: 'morning' },
    { label: 'Lunch', category: 'Food', slot: 'afternoon' },
    { label: 'Coffee', category: 'Food', slot: 'evening' },
    { label: 'Evening Snack', category: 'Food', slot: 'evening' },
    { label: 'Dinner', category: 'Food', slot: 'night' }
  ];
  orderedPresets: QuickPreset[] = [];
  suggestedPresetLabel = '';
  selectedPreset = '';
  customTitle = '';
  amountInput: number | null = null;
  selectedCategory = 'Food';
  quickAmounts = [20, 50, 100, 250, 500];

  ngOnInit(): void {
    this.syncRealTimeClock();
    this.applyTimeBasedPresets();

    const token = localStorage.getItem('token');
    const savedName = localStorage.getItem('userName');
    const savedMonth = localStorage.getItem('activeMonth');

    if (token && savedName) {
      this.currentUserName = savedName;
      if (savedMonth) {
        this.setupForm.month = savedMonth;
        this.initializeActiveDateForMonth(savedMonth);
        this.currentStep = 'dashboard';
        this.loadTransactions();
      } else {
        this.setupForm.month = this.realTimeMonth;
        this.currentStep = 'setup';
      }
    }
  }

  private syncRealTimeClock(): void {
    const now = new Date();
    this.realTimeToday = now.toLocaleDateString('en-CA');
    this.realTimeMonth = this.realTimeToday.slice(0, 7);
  }

  applyTimeBasedPresets(): void {
    const hour = new Date().getHours();
    let currentSlot: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';

    if (hour >= 6 && hour < 11) {
      currentSlot = 'morning';
    } else if (hour >= 11 && hour < 16) {
      currentSlot = 'afternoon';
    } else if (hour >= 16 && hour < 20) {
      currentSlot = 'evening';
    } else {
      currentSlot = 'night';
    }

    const matching = this.allPresets.filter((p) => p.slot === currentSlot);
    const others = this.allPresets.filter((p) => p.slot !== currentSlot);
    this.orderedPresets = [...matching, ...others];

    if (matching.length > 0 && !this.editingId) {
      this.suggestedPresetLabel = matching[0].label;
      this.selectPreset(matching[0]);
    }
  }

  selectPreset(preset: QuickPreset): void {
    this.selectedPreset = preset.label;
    this.selectedCategory = preset.category;
    this.customTitle = '';
  }

  onCustomTitleInput(): void {
    if (this.customTitle.trim().length > 0) {
      this.selectedPreset = '';
      this.autoDetectCategory(this.customTitle);
    } else if (this.orderedPresets.length > 0) {
      this.selectPreset(this.orderedPresets[0]);
    }
  }

  addQuickAmount(val: number): void {
    this.amountInput = (Number(this.amountInput) || 0) + val;
  }

  getEffectiveTitle(): string {
    return this.customTitle.trim() || this.selectedPreset;
  }

  getMonthLabel(yyyyMm: string): string {
    if (!yyyyMm) return '';
    const [year, month] = yyyyMm.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  getFormattedActiveDate(): string {
    if (!this.activeDate) return '';
    const [year, month, day] = this.activeDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  initializeActiveDateForMonth(monthStr: string): void {
    this.syncRealTimeClock();
    if (monthStr === this.realTimeMonth) {
      this.activeDate = this.realTimeToday;
    } else {
      this.activeDate = `${monthStr}-01`;
    }
  }

  useCurrentMonth(): void {
    this.syncRealTimeClock();
    this.setupForm.month = this.realTimeMonth;
  }

  changeDay(offset: number): void {
    const [year, month, day] = this.activeDate.split('-').map(Number);
    const current = new Date(year, month - 1, day);
    current.setDate(current.getDate() + offset);

    const nextDateStr = current.toLocaleDateString('en-CA');
    if (nextDateStr.startsWith(this.setupForm.month)) {
      this.activeDate = nextDateStr;
      this.updateDisplayedExpenses();
    }
  }

  onDatePickerChange(newDate: string): void {
    if (!newDate) return;
    this.activeDate = newDate;
    this.setupForm.month = newDate.slice(0, 7);
    localStorage.setItem('activeMonth', this.setupForm.month);
    this.loadTransactions();
  }

  canGoPrevDay(): boolean {
    return !this.activeDate.endsWith('-01');
  }

  canGoNextDay(): boolean {
    const [year, month] = this.setupForm.month.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const lastDateStr = `${this.setupForm.month}-${String(lastDay).padStart(2, '0')}`;
    return this.activeDate < lastDateStr;
  }

  toggleAuthMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
    this.authError = '';
  }

  submitAuth(): void {
    this.authError = '';
    if (this.isRegisterMode) {
      this.expenseService.register(this.authForm).subscribe({
        next: (res) => this.handleAuthSuccess(res),
        error: (err) => (this.authError = err.error?.error || 'Registration failed.')
      });
    } else {
      this.expenseService.login({ email: this.authForm.email, password: this.authForm.password }).subscribe({
        next: (res) => this.handleAuthSuccess(res),
        error: (err) => (this.authError = err.error?.error || 'Login failed.')
      });
    }
  }

  private handleAuthSuccess(res: any): void {
    localStorage.setItem('token', res.token);
    localStorage.setItem('userName', res.user.name);
    this.currentUserName = res.user.name;
    this.authForm = { name: '', email: '', password: '' };
    this.syncRealTimeClock();
    this.setupForm.month = this.realTimeMonth;
    this.currentStep = 'setup';
  }

  submitSetup(): void {
    this.setupError = '';
    if (!this.setupForm.month || this.setupForm.income <= 0) {
      this.setupError = 'Please select a month and enter a valid monthly salary.';
      return;
    }

    localStorage.setItem('activeMonth', this.setupForm.month);

    const incomeEntry: Transaction = {
      title: `Monthly Salary (${this.setupForm.month})`,
      amount: this.setupForm.income,
      type: 'income',
      category: 'Salary',
      transaction_date: `${this.setupForm.month}-01`
    };

    this.expenseService.getTransactions().pipe(
      switchMap((allTx) => {
        const oldSalaries = allTx.filter(
          (t) =>
            t.type === 'income' &&
            new Date(t.transaction_date).toLocaleDateString('en-CA').startsWith(this.setupForm.month)
        );
        const deleteCalls = oldSalaries.map((s) => this.expenseService.deleteTransaction(s.id!));
        return deleteCalls.length > 0 ? forkJoin(deleteCalls) : of([]);
      }),
      switchMap(() => this.expenseService.addTransaction(incomeEntry))
    ).subscribe({
      next: () => {
        this.initializeActiveDateForMonth(this.setupForm.month);
        this.applyTimeBasedPresets();
        this.currentStep = 'dashboard';
        this.loadTransactions();
      },
      error: (err) => {
        this.setupError = err.error?.error || 'Could not save monthly salary.';
      }
    });
  }

  openSetupPage(): void {
    this.setupForm.income = this.totalIncome;
    this.currentStep = 'setup';
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('activeMonth');
    this.currentStep = 'auth';
    this.currentUserName = '';
    this.transactions = [];
    this.expenseList = [];
    this.displayedExpenses = [];
    if (this.chart) this.chart.destroy();
  }

  autoDetectCategory(rawText: string): void {
    const text = rawText.toLowerCase();
    if (/swiggy|zomato|food|lunch|dinner|breakfast|groceries|tea|coffee|biryani|snack/.test(text)) {
      this.selectedCategory = 'Food';
    } else if (/uber|ola|rapido|metro|bus|petrol|fuel|train/.test(text)) {
      this.selectedCategory = 'Transport';
    } else if (/rent|pg|maintenance/.test(text)) {
      this.selectedCategory = 'Housing';
    } else if (/electricity|eb|wifi|internet|recharge|water/.test(text)) {
      this.selectedCategory = 'Utilities';
    } else if (/movie|netflix|spotify|game/.test(text)) {
      this.selectedCategory = 'Entertainment';
    } else if (/amazon|flipkart|myntra|clothes|shoes|shop/.test(text)) {
      this.selectedCategory = 'Shopping';
    } else if (/doctor|hospital|medicine|pharmacy|gym/.test(text)) {
      this.selectedCategory = 'Health';
    }
  }

  loadTransactions(): void {
    this.expenseService.getTransactions().subscribe({
      next: (data) => {
        this.transactions = data.filter((t) =>
          new Date(t.transaction_date).toLocaleDateString('en-CA').startsWith(this.setupForm.month)
        );
        this.expenseList = this.transactions.filter((t) => t.type === 'expense');
        this.updateDisplayedExpenses();
        this.calculateSummary();
        setTimeout(() => this.renderChart(), 0);
      },
      error: () => this.logout()
    });
  }

  updateDisplayedExpenses(): void {
    const selectedDayItems = this.expenseList.filter(
      (t) => new Date(t.transaction_date).toLocaleDateString('en-CA') === this.activeDate
    );
    this.dailyTotal = selectedDayItems.reduce((sum, t) => sum + Number(t.amount), 0);
    this.displayedExpenses = this.showAllMonthExpenses ? this.expenseList : selectedDayItems;
  }

  calculateSummary(): void {
    const salaryEntry = this.transactions.find((t) => t.type === 'income');
    this.totalIncome = salaryEntry ? Number(salaryEntry.amount) : 0;

    this.totalExpense = this.expenseList
      .reduce((sum, t) => sum + Number(t.amount), 0);

    this.balance = this.totalIncome - this.totalExpense;
    this.spentPercentage = this.totalIncome > 0
      ? Math.min(Math.round((this.totalExpense / this.totalIncome) * 100), 100)
      : 0;
  }

  private triggerToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      this.toastMessage = '';
    }, 2600);
  }

  saveExpense(): void {
    const finalTitle = this.getEffectiveTitle();
    const finalAmount = Number(this.amountInput);
    if (!finalTitle || !finalAmount || finalAmount <= 0) return;

    const payload: Transaction = {
      title: finalTitle,
      amount: finalAmount,
      type: 'expense',
      category: this.selectedCategory,
      transaction_date: this.activeDate
    };

    if (this.editingId) {
      this.expenseService.updateTransaction(this.editingId, payload).subscribe(() => {
        this.triggerToast(`Updated ${finalTitle} (₹${finalAmount})`);
        this.resetForm();
        this.loadTransactions();
      });
    } else {
      this.expenseService.addTransaction(payload).subscribe(() => {
        this.triggerToast(`Saved ${finalTitle} — ₹${finalAmount}`);
        this.resetForm();
        this.loadTransactions();
      });
    }
  }

  editExpense(tx: Transaction): void {
    this.editingId = tx.id!;
    const txDate = new Date(tx.transaction_date).toLocaleDateString('en-CA');
    this.activeDate = txDate;
    this.amountInput = Number(tx.amount);
    this.selectedCategory = tx.category;

    const matchedPreset = this.allPresets.find((p) => p.label.toLowerCase() === tx.title.toLowerCase());
    if (matchedPreset) {
      this.selectedPreset = matchedPreset.label;
      this.customTitle = '';
    } else {
      this.selectedPreset = '';
      this.customTitle = tx.title;
    }
  }

  deleteExpense(id: number): void {
    this.expenseService.deleteTransaction(id).subscribe(() => {
      this.triggerToast('Expense deleted');
      this.loadTransactions();
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.amountInput = null;
    this.customTitle = '';
    this.applyTimeBasedPresets();
  }

  renderChart(): void {
    const expenseByCategory: Record<string, number> = {};
    this.expenseList.forEach((t) => {
      expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + Number(t.amount);
    });

    if (this.chart) this.chart.destroy();

    const ctx = document.getElementById('expenseChart') as HTMLCanvasElement;
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(expenseByCategory),
        datasets: [{
          data: Object.values(expenseByCategory),
          backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } }
        }
      }
    });
  }
}
