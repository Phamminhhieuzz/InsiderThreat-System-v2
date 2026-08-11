import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    SafetyCertificateOutlined,
    EyeOutlined,
    FileProtectOutlined,
    MessageOutlined,
    VideoCameraOutlined,
    TeamOutlined,
    CheckCircleOutlined,
    ArrowRightOutlined,
    RocketOutlined
} from '@ant-design/icons';
import LanguageSelector from '../components/LanguageSelector';
import styles from './landing.module.css';

const LandingPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        // Intersection Observer for animations
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setVisibleSections((prev) => new Set(prev).add(entry.target.id));
                    }
                });
            },
            { threshold: 0.1 }
        );

        const sections = document.querySelectorAll('[data-section]');
        sections.forEach((section) => observerRef.current?.observe(section));

        return () => observerRef.current?.disconnect();
    }, []);

    const features = [
        { icon: <SafetyCertificateOutlined />, key: 0 },
        { icon: <EyeOutlined />, key: 1 },
        { icon: <FileProtectOutlined />, key: 2 },
        { icon: <MessageOutlined />, key: 3 },
        { icon: <VideoCameraOutlined />, key: 4 },
        { icon: <TeamOutlined />, key: 5 }
    ];

    const stats = t('landing.problem.stats', { returnObjects: true }) as Array<{ value: string; label: string }>;

    return (
        <div className={styles.landing}>
            {/* Floating Header */}
            <header className={styles.header}>
                <div className={styles.logo}>
                    <SafetyCertificateOutlined style={{ fontSize: 28 }} />
                    <span>InsiderThreat</span>
                </div>
                <LanguageSelector />
            </header>

            {/* Hero Section */}
            <section
                id="hero"
                data-section
                className={`${styles.hero} ${visibleSections.has('hero') ? styles.visible : ''}`}
            >
                <div className={styles.heroBackground}></div>
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        {t('landing.hero.title')}
                    </h1>
                    <p className={styles.heroSubtitle}>
                        {t('landing.hero.subtitle')}
                    </p>
                    <div className={styles.heroCta}>
                        <button
                            className={styles.btnPrimary}
                            onClick={() => navigate('/login')}
                        >
                            {t('landing.hero.cta_primary')}
                            <RocketOutlined />
                        </button>
                        <button className={styles.btnSecondary}>
                            {t('landing.hero.cta_secondary')}
                        </button>
                    </div>
                </div>
            </section>

            {/* Problem Statement */}
            <section
                id="problem"
                data-section
                className={`${styles.section} ${visibleSections.has('problem') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.problem.title')}</h2>
                    <p className={styles.sectionDescription}>
                        {t('landing.problem.description')}
                    </p>
                    <div className={styles.statsGrid}>
                        {stats.map((stat, index) => (
                            <div key={index} className={styles.statCard}>
                                <div className={styles.statValue}>{stat.value}</div>
                                <div className={styles.statLabel}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Showcase */}
            <section
                id="features"
                data-section
                className={`${styles.section} ${styles.featuresSection} ${visibleSections.has('features') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.features.title')}</h2>
                    <p className={styles.sectionSubtitle}>{t('landing.features.subtitle')}</p>
                    <div className={styles.featuresGrid}>
                        {features.map((feature, index) => {
                            const item = t(`landing.features.items.${index}`, { returnObjects: true }) as { title: string; description: string };
                            return (
                                <div key={feature.key} className={styles.featureCard}>
                                    <div className={styles.featureIcon}>{feature.icon}</div>
                                    <h3 className={styles.featureTitle}>{item.title}</h3>
                                    <p className={styles.featureDescription}>{item.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section
                id="how-it-works"
                data-section
                className={`${styles.section} ${visibleSections.has('how-it-works') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.howItWorks.title')}</h2>
                    <div className={styles.stepsTimeline}>
                        {[0, 1, 2, 3].map((index) => {
                            const step = t(`landing.howItWorks.steps.${index}`, { returnObjects: true }) as { title: string; description: string };
                            return (
                                <div key={index} className={styles.stepCard}>
                                    <div className={styles.stepNumber}>{index + 1}</div>
                                    <h3 className={styles.stepTitle}>{step.title}</h3>
                                    <p className={styles.stepDescription}>{step.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Benefits */}
            <section
                id="benefits"
                data-section
                className={`${styles.section} ${visibleSections.has('benefits') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.benefits.title')}</h2>
                    <div className={styles.benefitsGrid}>
                        {[0, 1, 2, 3, 4, 5].map((index) => {
                            const benefit = t(`landing.benefits.items.${index}`, { returnObjects: true }) as { title: string; description: string };
                            return (
                                <div key={index} className={styles.benefitCard}>
                                    <CheckCircleOutlined className={styles.benefitIcon} />
                                    <h3 className={styles.benefitTitle}>{benefit.title}</h3>
                                    <p className={styles.benefitDescription}>{benefit.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section
                id="testimonials"
                data-section
                className={`${styles.section} ${styles.testimonialsSection} ${visibleSections.has('testimonials') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.testimonials.title')}</h2>
                    <div className={styles.testimonialsGrid}>
                        {[0, 1, 2].map((index) => {
                            const testimonial = t(`landing.testimonials.items.${index}`, { returnObjects: true }) as { name: string; role: string; quote: string };
                            return (
                                <div key={index} className={styles.testimonialCard}>
                                    <div className={styles.quote}>"{testimonial.quote}"</div>
                                    <div className={styles.author}>
                                        <div className={styles.authorName}>{testimonial.name}</div>
                                        <div className={styles.authorRole}>{testimonial.role}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section
                id="pricing"
                data-section
                className={`${styles.section} ${visibleSections.has('pricing') ? styles.visible : ''}`}
            >
                <div className={styles.container}>
                    <h2 className={styles.sectionTitle}>{t('landing.pricing.title')}</h2>
                    <p className={styles.sectionSubtitle}>{t('landing.pricing.subtitle')}</p>
                    <div className={styles.pricingGrid}>
                        {[0, 1, 2].map((index) => {
                            const plan = t(`landing.pricing.plans.${index}`, { returnObjects: true }) as {
                                name: string;
                                price: string;
                                period?: string;
                                description: string;
                                features: string[];
                                popular?: boolean;
                            };
                            return (
                                <div
                                    key={index}
                                    className={`${styles.pricingCard} ${plan.popular ? styles.popularPlan : ''}`}
                                >
                                    {plan.popular && <div className={styles.popularBadge}>POPULAR</div>}
                                    <h3 className={styles.planName}>{plan.name}</h3>
                                    <div className={styles.planPrice}>
                                        {plan.price}
                                        {plan.period && <span className={styles.planPeriod}>/{plan.period}</span>}
                                    </div>
                                    <p className={styles.planDescription}>{plan.description}</p>
                                    <ul className={styles.planFeatures}>
                                        {plan.features.map((feature, fIndex) => (
                                            <li key={fIndex}>
                                                <CheckCircleOutlined />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                    <button className={plan.popular ? styles.btnPrimary : styles.btnSecondary}>
                                        {t('common.getStarted')}
                                        <ArrowRightOutlined />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section
                id="cta"
                data-section
                className={`${styles.section} ${styles.ctaSection} ${visibleSections.has('cta') ? styles.visible : ''}`}
            >
                <div className={styles.ctaContent}>
                    <h2 className={styles.ctaTitle}>{t('landing.cta.title')}</h2>
                    <p className={styles.ctaSubtitle}>{t('landing.cta.subtitle')}</p>
                    <button
                        className={styles.btnPrimary}
                        onClick={() => navigate('/login')}
                    >
                        {t('landing.cta.button')}
                        <RocketOutlined />
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.container}>
                    <div className={styles.footerGrid}>
                        <div className={styles.footerBrand}>
                            <div className={styles.footerLogo}>
                                <SafetyCertificateOutlined style={{ fontSize: 32 }} />
                                <span>{t('landing.footer.company')}</span>
                            </div>
                            <p className={styles.footerTagline}>{t('landing.footer.tagline')}</p>
                        </div>
                        <div className={styles.footerLinks}>
                            <h4>{t('landing.footer.links.product')}</h4>
                            <ul>
                                <li><a href="#features">{t('landing.footer.links.solutions')}</a></li>
                                <li><a href="#pricing">{t('landing.footer.links.pricing')}</a></li>
                                <li><a href="#docs">{t('landing.footer.links.docs')}</a></li>
                            </ul>
                        </div>
                        <div className={styles.footerLinks}>
                            <h4>{t('landing.footer.links.about')}</h4>
                            <ul>
                                <li><a href="#blog">{t('landing.footer.links.blog')}</a></li>
                                <li><a href="#careers">{t('landing.footer.links.careers')}</a></li>
                                <li><a href="#contact">{t('landing.footer.links.contact')}</a></li>
                            </ul>
                        </div>
                        <div className={styles.footerLinks}>
                            <h4>{t('common.language')}</h4>
                            <LanguageSelector />
                        </div>
                    </div>
                    <div className={styles.footerBottom}>
                        <p>{t('landing.footer.copyright')}</p>
                        <div className={styles.footerLegal}>
                            <a href="#privacy">{t('landing.footer.legal.privacy')}</a>
                            <a href="#terms">{t('landing.footer.legal.terms')}</a>
                            <a href="#security">{t('landing.footer.legal.security')}</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
