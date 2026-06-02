'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { 
  Zap, MapPin, Trophy, Shield, Rocket, ArrowRight, CheckCircle2, 
  BarChart3, Users2, Clock, Smartphone
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function Home() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-white selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 text-white">
              <Zap className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">TaskReward Workforce</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#roles" className="hover:text-indigo-600 transition-colors">Roles</a>
            <a href="#saas" className="hover:text-indigo-600 transition-colors">SaaS</a>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Link 
                href={user.role === 'employee' ? '/employee/dashboard' : '/admin/dashboard'}
                className="btn btn-primary px-5 py-2 rounded-xl flex items-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors">
                  Log in
                </Link>
                <Link href="/login" className="btn btn-primary px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-100">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto text-center lg:text-left grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 max-w-2xl mx-auto lg:mx-0 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-widest">
              <Rocket className="w-3 h-3" />
              Next-Gen SaaS Platform
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] tracking-tight">
              Complete <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">Workforce</span> Operations.
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed">
              TaskReward is an integrated workforce operations platform connecting tasks, attendance, leave, and payroll into one trustworthy operational system.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
              <Link href="/login" className="btn btn-primary btn-lg w-full sm:w-auto px-10 py-4.5 text-lg rounded-2xl shadow-2xl shadow-indigo-200">
                Start Managing Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link href="#features" className="btn btn-secondary btn-lg w-full sm:w-auto px-10 py-4.5 text-lg rounded-2xl border-slate-200 bg-white">
                Explore Features
              </Link>
            </div>
            <div className="flex items-center justify-center lg:justify-start gap-8 pt-6 text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-700">SaaS Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-700">Live Location</span>
              </div>
            </div>
          </div>
          
          <div className="relative lg:block hidden">
            <div className="absolute inset-0 bg-indigo-100 rounded-[3rem] blur-3xl opacity-40 -z-10 transform rotate-6"></div>
            <div className="glass-strong rounded-[2.5rem] p-3 border border-slate-200 shadow-[0_32px_64px_-12px_rgba(79,70,229,0.15)] transform hover:-translate-y-2 transition-transform duration-700">
              <Image 
                src="/taskreward_hero_mockup.png" 
                alt="TaskReward Dashboard Preview" 
                width={900} 
                height={675} 
                className="rounded-[2rem] shadow-sm"
                priority
              />
            </div>
            
            {/* Floating Badge */}
            <div className="absolute -bottom-8 -left-8 glass p-6 rounded-2xl shadow-xl border border-slate-200 max-w-[220px] animate-bounce-slow">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Live Check-in</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">Automatic Geolocation capture for every session.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-slate-50/60 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Everything you need to scale</h2>
            <div className="h-1.5 w-20 bg-indigo-600 mx-auto rounded-full mb-6"></div>
            <p className="text-lg text-slate-600">Power your organization with advanced features designed for the modern remote and hybrid workforce.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { 
                title: "Location Attendance", 
                desc: "Audit-ready geolocation logs for every punch-in and punch-out session.",
                icon: MapPin, 
                color: "text-indigo-600", 
                bg: "bg-indigo-50" 
              },
              { 
                title: "Gamified Rewards", 
                desc: "Incentivize early completions with automated reward point distribution.",
                icon: Trophy, 
                color: "text-amber-600", 
                bg: "bg-amber-50" 
              },
              { 
                title: "Task Orchestration", 
                desc: "Assign, prioritize, and track tasks with multi-party remarks and updates.",
                icon: BarChart3, 
                color: "text-emerald-600", 
                bg: "bg-emerald-50" 
              },
              { 
                title: "RBAC Security", 
                desc: "Precise permissions ensuring data privacy between Admin and Employee roles.",
                icon: Shield, 
                color: "text-rose-600", 
                bg: "bg-rose-50" 
              },
            ].map((f, i) => (
              <div key={i} className="group bg-white p-10 rounded-[2.5rem] border border-slate-100 hover:border-indigo-200 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-indigo-50/50">
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-transform group-hover:scale-110 duration-300 shadow-sm", f.bg)}>
                  <f.icon className={cn("w-8 h-8", f.color)} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role Hierarchy Section */}
      <section id="roles" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="glass-strong rounded-[4rem] p-12 lg:p-20 border border-slate-200 overflow-hidden relative shadow-2xl shadow-indigo-50/40">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-50/30 to-transparent -z-10"></div>
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-5xl font-extrabold text-slate-900 leading-tight">Streamlined Roles.</h2>
                  <p className="text-xl text-slate-600 leading-relaxed">TaskReward scales with your ambition. Manage hundreds of employees across departments with optimized management portals.</p>
                </div>
                
                <div className="space-y-5">
                  {[
                    "Admin: Full Organization Management",
                    "Employee: Personal Tasks & Attendance"
                  ].map((role, i) => (
                    <div key={i} className="flex items-center gap-4 group">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 group-hover:text-white transition-colors" />
                      </div>
                      <span className="text-slate-700 font-bold text-lg">{role}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 relative">
                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 translate-y-12 hover:-translate-y-2 transition-all duration-500">
                    <Users2 className="w-10 h-10 text-indigo-500 mb-6" />
                    <h4 className="text-lg font-bold">Team Visibility</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">Admins get real-time insights into team productivity.</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 translate-y-12 hover:-translate-y-2 transition-all duration-500">
                    <Smartphone className="w-10 h-10 text-emerald-500 mb-6" />
                    <h4 className="text-lg font-bold">Mobile First</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">Perfectly responsive for field-based attendance capture.</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 hover:-translate-y-2 transition-all duration-500">
                    <Clock className="w-10 h-10 text-amber-500 mb-6" />
                    <h4 className="text-lg font-bold">Live Tracking</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">Real-time monitoring of work hours and active attendance sessions.</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 hover:-translate-y-2 transition-all duration-500">
                    <Shield className="w-10 h-10 text-rose-500 mb-6" />
                    <h4 className="text-lg font-bold">SaaS Security</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">JWT-based authentication with strict data isolation for every company.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="saas" className="py-32 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="bg-indigo-600 rounded-[4rem] p-16 lg:p-24 relative overflow-hidden shadow-3xl shadow-indigo-200">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-violet-600 -z-10"></div>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>
            
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-8 tracking-tight">Ready to scale your workforce?</h2>
            <p className="text-xl text-indigo-100 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">Join high-performing organizations using TaskReward to automate attendance, tasks, and rewards.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/login" className="bg-white text-indigo-600 hover:bg-indigo-50 transition-all font-bold px-12 py-5 rounded-2xl text-xl shadow-2xl">
                Get Started Now
              </Link>
              <Link href="/login" className="bg-indigo-700/50 text-white hover:bg-indigo-700/80 transition-all font-bold px-12 py-5 rounded-2xl text-xl backdrop-blur-md border border-indigo-400/30">
                Log In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-indigo-600" />
              <span className="text-2xl font-black text-slate-900 tracking-tighter uppercase">TaskReward Workforce</span>
            </div>
            <p className="text-slate-500 max-w-sm leading-relaxed">The integrated workforce operations platform for modern employee task management, rewards, and compliance-ready attendance.</p>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 mb-6 uppercase text-xs tracking-widest">Platform</h5>
            <ul className="space-y-4 text-sm text-slate-500 font-medium">
              <li><a href="#features" className="hover:text-indigo-600 transition-colors">Features</a></li>
              <li><a href="#roles" className="hover:text-indigo-600 transition-colors">Role Hierarchy</a></li>
              <li><a href="#saas" className="hover:text-indigo-600 transition-colors">SaaS Security</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 mb-6 uppercase text-xs tracking-widest">Company</h5>
            <ul className="space-y-4 text-sm text-slate-500 font-medium">
              <li><a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-indigo-600 transition-colors">Support</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-12 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">© 2026 TaskReward Platform. Built for Excellence.</p>
          <div className="flex gap-6">
             {/* Social placeholders */}
             <div className="w-5 h-5 bg-slate-100 rounded-full"></div>
             <div className="w-5 h-5 bg-slate-100 rounded-full"></div>
             <div className="w-5 h-5 bg-slate-100 rounded-full"></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
