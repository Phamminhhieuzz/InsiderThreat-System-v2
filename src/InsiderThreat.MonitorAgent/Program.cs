using InsiderThreat.MonitorAgent;
using InsiderThreat.MonitorAgent.Services;

var builder = Host.CreateApplicationBuilder(args);

// Register all monitoring services as singletons
builder.Services.AddSingleton<LocalDatabaseService>();
builder.Services.AddSingleton<TextCaptureService>();
builder.Services.AddSingleton<KeyboardHookService>();
builder.Services.AddSingleton<KeywordAnalyzerService>();
builder.Services.AddSingleton<ScreenshotMonitorService>();
builder.Services.AddSingleton<ClipboardMonitor>();
builder.Services.AddSingleton<ServerSyncService>();
builder.Services.AddSingleton<ProcessMonitorService>();

// Register the main worker and file tracker
builder.Services.AddHostedService<MonitorWorker>();
builder.Services.AddHostedService<FileTrackerService>();

var host = builder.Build();

Console.Title = "InsiderThreat MonitorAgent";
Console.ForegroundColor = ConsoleColor.Cyan;
Console.WriteLine(@"
  ╔══════════════════════════════════════════════════╗
  ║     InsiderThreat Monitor Agent v1.0             ║
  ║     Giám sát hành vi & Chống rò rỉ dữ liệu     ║
  ╚══════════════════════════════════════════════════╝
");
Console.ResetColor();

host.Run();
