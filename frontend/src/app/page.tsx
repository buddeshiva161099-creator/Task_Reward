'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { 
  Zap, MapPin, Trophy, Shield, Rocket, ArrowRight, CheckCircle2, 
  BarChart3, Users2, Clock, Smartphone, Brain, DollarSign, Calendar,
  ChevronDown, HelpCircle, Activity, Star, Eye
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'employee' | 'admin' | 'owner'>('employee');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 selection:bg-indigo-100 selection:text-indigo-900 font-sans overflow-x-hidden font-light">
      {/* Background glow graphics (light theme friendly) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-[20%] right-1/4 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[20%] left-1/3 w-[500px] h-[500px] bg-amber-500/3 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 text-white">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              TaskReward
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors duration-200">Features</a>
            <a href="#demo" className="hover:text-indigo-600 transition-colors duration-200">Roles Demo</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors duration-200">Pricing</a>
            <a href="#faq" className="hover:text-indigo-600 transition-colors duration-200">FAQ</a>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Link 
                href={user.role === 'employee' ? '/employee/dashboard' : '/admin/dashboard'}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-200 transition-all duration-200 hover:-translate-y-0.5"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
                  Log in
                </Link>
                <Link 
                  href="/login" 
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all duration-200 hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 text-center lg:text-left relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide">
              <Rocket className="w-3.5 h-3.5 text-indigo-600 animate-bounce" />
              Next-Gen Operations Platform
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] tracking-tight">
              Complete <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">Workforce</span> Operations.
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              An integrated, trust-driven operations platform linking employee tasks, geolocation attendance, shift scheduling, and smart payroll into one secure workspace.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Link 
                href="/login" 
                className="w-full sm:w-auto px-8 py-4 text-base font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-550 hover:to-violet-550 text-white shadow-xl shadow-indigo-200 transition-all duration-305 hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                Start Managing Today
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a 
                href="#features" 
                className="w-full sm:w-auto px-8 py-4 text-base font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-center"
              >
                Explore Features
              </a>
            </div>
            
            <div className="flex items-center justify-center lg:justify-start gap-8 pt-6 text-slate-400 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Multi-Tenant Isolation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">AI Fatigue Alerts</span>
              </div>
            </div>
          </div>
          
          {/* Mockup Preview */}
          <div className="relative z-10 flex justify-center lg:justify-end">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-3xl blur opacity-20 animate-pulse" />
            <div className="relative bg-white p-2.5 rounded-3xl border border-slate-200 shadow-2xl">
              <Image 
                src="/taskreward_hero_mockup.png" 
                alt="TaskReward Dashboard Preview" 
                width={800} 
                height={600} 
                className="rounded-2xl shadow-sm border border-slate-100"
                priority
              />
              
              {/* Floating Widget 1 */}
              <div className="absolute -bottom-6 -left-6 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-100 shadow-2xl flex items-center gap-3.5 max-w-[220px]">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Geofenced Punch</span>
                  <span className="text-xs font-bold text-slate-800">Capture Live Coordinates</span>
                </div>
              </div>

              {/* Floating Widget 2 */}
              <div className="absolute -top-6 right-6 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-100 shadow-2xl flex items-center gap-3.5 max-w-[220px]">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fatigue Engine</span>
                  <span className="text-xs font-bold text-slate-800">Burnout Alerts Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <span className="block text-3xl lg:text-4xl font-extrabold text-slate-900">99.9%</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Uptime SLA</span>
          </div>
          <div>
            <span className="block text-3xl lg:text-4xl font-extrabold text-slate-900">0%</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Leakage</span>
          </div>
          <div>
            <span className="block text-3xl lg:text-4xl font-extrabold text-slate-900">10x</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Incentivization</span>
          </div>
          <div>
            <span className="block text-3xl lg:text-4xl font-extrabold text-slate-900">100%</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Compliant Payroll</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 relative bg-slate-50/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl lg:text-5xl font-bold tracking-tight text-slate-900">Built for Operational Integrity</h2>
            <p className="text-slate-600">
              Eliminate payroll leaks, track task statuses cleanly, and keep employees engaged through gamified rewards.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { 
                title: "Compliance Attendance", 
                desc: "Secure geofencing verifies live coordinates on every check-in to prevent attendance spoofing.",
                icon: MapPin, 
                color: "text-indigo-600", 
                bg: "bg-indigo-50",
                border: "hover:border-indigo-300"
              },
              { 
                title: "Gamified Rewards Ledger", 
                desc: "Distribute reward points instantly for early task completions, redeemable or factorable into payroll.",
                icon: Trophy, 
                color: "text-amber-600", 
                bg: "bg-amber-50",
                border: "hover:border-amber-300"
              },
              { 
                title: "AI Fatigue Assistant", 
                desc: "Tracks total continuous working hours and sounds alarms to admins if employees approach health fatigue limits.",
                icon: Brain, 
                color: "text-purple-600", 
                bg: "bg-purple-50",
                border: "hover:border-purple-300"
              },
              { 
                title: "Secured Isolation", 
                desc: "Tenant-level data scoping ensures absolute isolation between different organizations, admins, and employees.",
                icon: Shield, 
                color: "text-rose-600", 
                bg: "bg-rose-50",
                border: "hover:border-rose-300"
              },
            ].map((f, i) => (
              <div 
                key={i} 
                className={cn(
                  "group p-8 rounded-2xl border border-slate-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
                  f.border
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-6 shadow-sm", f.bg)}>
                  <f.icon className={cn("w-6 h-6", f.color)} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role Interactive Showcase Section */}
      <section id="demo" className="py-20 border-t border-slate-100 bg-slate-50/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">Three Distinct Access Portals</h2>
            <p className="text-slate-600 mt-3 font-normal">Click on a role below to preview their custom interface details and workflows.</p>
          </div>

          {/* Tab Selector */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              {[
                { id: 'employee', label: 'Employee Role', icon: Smartphone },
                { id: 'admin', label: 'Admin Role', icon: Users2 },
                { id: 'owner', label: 'Platform Owner', icon: Star }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300",
                    activeTab === tab.id
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Card */}
          <div className="bg-white border border-slate-150 rounded-3xl p-8 lg:p-12 shadow-xl">
            {activeTab === 'employee' && (
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                    <Activity className="w-3.5 h-3.5" />
                    Personal Execution Dashboard
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Streamlined Experience for the Field & Office</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Employees can clock in with real-time geofence validation, check current tasks, and instantly earn reward points upon task completion. Regularization requests make correcting attendance issues quick and painless.
                  </p>
                  <ul className="space-y-3.5 font-light">
                    {[
                      "Geolocated Attendance checks on check-in/out",
                      "View assigned tasks, deadlines, and project details",
                      "Check Leave Balance ledger and request leave dynamically",
                      "Track accumulated reward points ledger and performance metrics"
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <span className="font-bold text-slate-700">Today's Shift</span>
                    <span className="text-xs bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Checked In</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Shift Hours</span>
                      <span className="text-slate-800 font-medium">09:00 AM - 06:00 PM</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Check-in Location</span>
                      <span className="text-slate-800 font-medium">New Delhi HQ (28.6139, 77.2090)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Earned Points</span>
                      <span className="text-amber-600 font-bold">+120 Points</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Link href="/login" className="w-full py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors">
                      <Eye className="w-4 h-4" /> View Live Employee Panel
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'admin' && (
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-555 bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
                    <Users2 className="w-3.5 h-3.5" />
                    Organization Operations Control
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Full Staff Management & Payroll Automation</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Admins configure tenant policies (shift schedules, geo coordinates, work hours) and track attendance. The automated payroll engine evaluates hours worked, leaves, and rewards to formulate accurate salary slips instantly.
                  </p>
                  <ul className="space-y-3.5 font-light">
                    {[
                      "Configure shift schedules, holidays, and company structures",
                      "Approve leave requests and regularization workflows",
                      "Automated Payroll Engine: generates salary reports with ease",
                      "Dashboard metrics: team productivity, fatigue indicators, active counts"
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                        <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <span className="font-bold text-slate-700">Admin Control Summary</span>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold">Active Tenant</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Active Employees</span>
                      <span className="text-slate-800 font-medium">42 Members</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Pending Regularizations</span>
                      <span className="text-rose-600 font-semibold">3 Requests</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Next Payroll Period</span>
                      <span className="text-slate-800 font-medium">July 31, 2026</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Link href="/login" className="w-full py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors">
                      <Eye className="w-4 h-4" /> View Live Admin Console
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'owner' && (
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                    <Star className="w-3.5 h-3.5" />
                    Platform Management Console
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Manage Tenants, Plans, and Audit Integrity</h3>
                  <p className="text-slate-600 leading-relaxed">
                    The Platform Owner oversees tenant provisioning, manages core subscription plan details, and audits platform activities via compliance-ready system logs.
                  </p>
                  <ul className="space-y-3.5 font-light">
                    {[
                      "Provision, suspend, or upgrade tenant accounts and limits",
                      "Manage global subscription plan codes, limits, and pricing structures",
                      "View system-wide metrics and consolidated performance logs",
                      "Investigate security events and audit trails across all companies"
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                        <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <span className="font-bold text-slate-700">Platform Owner Console</span>
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Root Level</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Active Tenants</span>
                      <span className="text-slate-800 font-medium">18 Registered</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Platform Health</span>
                      <span className="text-emerald-600 font-semibold">100% Operational</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Audit Logs Today</span>
                      <span className="text-slate-800 font-medium">238 Events Logged</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Link href="/owner/login" className="w-full py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors">
                      <Eye className="w-4 h-4" /> Go to Owner Login Portal
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Subscription Pricing Grid */}
      <section id="pricing" className="py-24 relative bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
            <h2 className="text-3xl lg:text-5xl font-bold tracking-tight text-slate-900">Transparent Pricing for Growing Teams</h2>
            <p className="text-slate-600">
              Start with a trial plan and scale limits easily as your employee counts expand.
            </p>
            
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3 pt-4">
              <span className={cn("text-sm font-semibold", billingCycle === 'monthly' ? "text-slate-900" : "text-slate-400")}>Monthly</span>
              <button 
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                className="w-12 h-6.5 bg-slate-200 rounded-full p-1 border border-slate-350 relative transition-colors"
              >
                <div 
                  className={cn(
                    "w-4.5 h-4.5 bg-indigo-650 bg-indigo-600 rounded-full transition-transform duration-200",
                    billingCycle === 'yearly' ? "translate-x-5" : ""
                  )} 
                />
              </button>
              <span className={cn("text-sm font-semibold flex items-center gap-1.5", billingCycle === 'yearly' ? "text-slate-900" : "text-slate-400")}>
                Yearly
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">Save 15%</span>
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-stretch">
            {/* Plan 1: Trial */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col justify-between hover:border-slate-300 hover:shadow-lg transition-all duration-300">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Trial</h3>
                  <p className="text-xs text-slate-400 mt-1">14-day evaluation environment</p>
                </div>
                
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">₹0</span>
                  <span className="text-xs text-slate-500">/ forever</span>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed font-light">
                  Best for evaluating features and getting a feel for the TaskReward workspace setup.
                </p>

                <div className="border-t border-slate-100 pt-6 space-y-3.5">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Up to 10 Employees</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Max 2 Administrators</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>1 GB Secure Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <CheckCircle2 className="w-4.5 h-4.5 text-slate-200 shrink-0" />
                    <span className="line-through">AI Fatigue Assistant</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link href="/login" className="block w-full text-center py-3 px-4 rounded-xl text-sm font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors">
                  Start Free Trial
                </Link>
              </div>
            </div>

            {/* Plan 2: Starter */}
            <div className="bg-white border-2 border-indigo-600 rounded-3xl p-8 flex flex-col justify-between relative shadow-xl shadow-indigo-150/40 hover:shadow-2xl transition-all duration-300">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-605 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest">
                Most Popular
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    Starter
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Excellent for growing small teams</p>
                </div>
                
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">
                    {billingCycle === 'monthly' ? "₹999" : "₹9,999"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {billingCycle === 'monthly' ? "/ month" : "/ year"}
                  </span>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed font-light">
                  Unlock core leave features and basic regularization systems for managing daily team operations.
                </p>

                <div className="border-t border-slate-100 pt-6 space-y-3.5">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Up to 25 Employees</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Max 3 Administrators</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>5 GB Secure Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Leave & Regularizations</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link href="/login" className="block w-full text-center py-3 px-4 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-colors">
                  Choose Starter
                </Link>
              </div>
            </div>

            {/* Plan 3: Pro */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col justify-between hover:border-slate-300 hover:shadow-lg transition-all duration-300">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Pro</h3>
                  <p className="text-xs text-slate-400 mt-1">Ultimate feature suite for larger teams</p>
                </div>
                
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">
                    {billingCycle === 'monthly' ? "₹2,499" : "₹24,999"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {billingCycle === 'monthly' ? "/ month" : "/ year"}
                  </span>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed font-light">
                  Full access including chat communications, payroll automation engine, and the AI-driven Fatigue Assistant.
                </p>

                <div className="border-t border-slate-100 pt-6 space-y-3.5">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Up to 200 Employees</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>Max 10 Administrators</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>50 GB Secure Storage</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                    <span>AI Assistant & Payroll Engine</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Link href="/login" className="block w-full text-center py-3 px-4 rounded-xl text-sm font-bold bg-white border border-slate-205 border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors">
                  Go Pro Today
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 border-t border-slate-100 bg-slate-50/60">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 flex items-center justify-center gap-2">
              <HelpCircle className="w-8 h-8 text-indigo-600" />
              Frequently Asked Questions
            </h2>
            <p className="text-slate-600">Everything you need to know about the TaskReward operational platform.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How does the Geofenced Attendance check work?",
                a: "When employees clock in or out from the interface, TaskReward automatically requests their device coordinates. These coordinates are checked against the company's configured latitude/longitude bounds to ensure verification before registering the punch record."
              },
              {
                q: "What is the AI Fatigue Assistant?",
                a: "It is an automated background monitor that logs overall work metrics and continuous activity. If an employee is exceeding normal shift durations or continuous task commitments, the AI logs a warning alert to help administrators prevent employee burnout."
              },
              {
                q: "How are Reward points calculated and integrated?",
                a: "Admins can configure base point rewards for each task category. When employees submit a task and it's marked as complete, points are ledger-coded to their profile. These can factor directly as incentives in the monthly payroll engine recalculation."
              },
              {
                q: "Is our organization's data isolated?",
                a: "Yes. TaskReward employs tenant-level security middleware. Every query on users, tasks, attendance, and payroll filters strictly by the active tenant ID, completely isolating your company's data from other database tenants."
              }
            ].map((faq, i) => (
              <div 
                key={i} 
                className="bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm"
              >
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between p-6 text-left font-bold text-slate-900 text-base hover:text-indigo-600 transition-colors focus:outline-none"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={cn("w-5 h-5 transition-transform duration-300 text-slate-400", openFaq === i ? "rotate-180" : "")} />
                </button>
                <div 
                  className={cn(
                    "transition-all duration-300 overflow-hidden",
                    openFaq === i ? "max-h-[500px] border-t border-slate-100" : "max-h-0"
                  )}
                >
                  <p className="p-6 text-sm text-slate-600 leading-relaxed bg-slate-50/50 font-light">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="relative bg-indigo-600 rounded-[2.5rem] p-16 lg:p-24 overflow-hidden shadow-2xl shadow-indigo-200">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl -z-10" />
            
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-6 tracking-tight">Ready to Align Your Operations?</h2>
            <p className="text-lg text-indigo-100 mb-10 max-w-xl mx-auto leading-relaxed font-light">
              Start with a 14-day evaluation and unlock geofencing, AI assistance, and compliance-ready payroll engine reports.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link 
                href="/login" 
                className="bg-white text-indigo-600 hover:bg-slate-55 hover:bg-indigo-50 transition-all font-bold px-8 py-4 rounded-xl text-base shadow-xl"
              >
                Get Started Now
              </Link>
              <Link 
                href="/login" 
                className="bg-indigo-700/50 text-white hover:bg-indigo-700/70 transition-all font-semibold px-8 py-4 rounded-xl text-base border border-indigo-400/30 backdrop-blur-sm"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-2 space-y-5">
            <div className="flex items-center gap-3">
              <Zap className="w-7 h-7 text-indigo-600" />
              <span className="text-xl font-bold text-slate-900 tracking-tight uppercase">TaskReward</span>
            </div>
            <p className="text-slate-500 max-w-sm text-sm leading-relaxed font-light">
              The integrated operational workspace for modern organizations, simplifying geofenced attendance logs, gamified task completion tracking, and payroll processing.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 mb-5 uppercase text-xs tracking-wider font-semibold">Features</h5>
            <ul className="space-y-3.5 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-indigo-600 transition-colors">Geofencing</a></li>
              <li><a href="#demo" className="hover:text-indigo-600 transition-colors">Role Portals</a></li>
              <li><a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing Details</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 mb-5 uppercase text-xs tracking-wider font-semibold">Platform</h5>
            <ul className="space-y-3.5 text-sm text-slate-500 font-medium">
              <li><a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a></li>
              <li><a href="/owner/login" className="hover:text-indigo-650 hover:text-indigo-600 transition-colors font-bold text-slate-400">Owner Portal</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-400 font-light">© 2026 TaskReward Workforce Operations Platform. All rights reserved.</p>
          <div className="flex gap-4">
             <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping" />
             <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Platform Healthy & Secured</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
