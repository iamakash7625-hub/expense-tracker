import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Transaction {
  id?: number;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  transaction_date: string;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private http = inject(HttpClient);
  // Automatically uses localhost when testing locally, or your live Render URL when deployed
  private baseUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    :'https://expense-tracker-22ma.onrender.com/api';

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  register(data: { name: string; email: string; password: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/register`, data);
  }

  login(data: { email: string; password: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, data);
  }

  getTransactions(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${this.baseUrl}/transactions`, { headers: this.getHeaders() });
  }

  addTransaction(tx: Transaction): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.baseUrl}/transactions`, tx, { headers: this.getHeaders() });
  }

  updateTransaction(id: number, tx: Transaction): Observable<any> {
    return this.http.put(`${this.baseUrl}/transactions/${id}`, tx, { headers: this.getHeaders() });
  }

  deleteTransaction(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/transactions/${id}`, { headers: this.getHeaders() });
  }
}
