using LlmTornado;
using LlmTornado.Chat;
using LlmTornado.Chat.Models;
using LlmTornado.Code;
using LlmTornado.Code.Models;
using LlmTornado.Code.Vendor;
using LlmTornado.Common;
using LlmTornado.Responses;
using LlmTornado.Threads;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.Data;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Microsoft.VisualBasic;
using NotT3ChatBackend.Data;
using NotT3ChatBackend.DTOs;
using NotT3ChatBackend.Endpoints;
using NotT3ChatBackend.Hubs;
using NotT3ChatBackend.Models;
using NotT3ChatBackend.Services;
using NotT3ChatBackend.Utils;
using Serilog;
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Reflection.Metadata;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

// This code is staying in one file for now as an intentional experiment for .NET 10's dotnet run app.cs feature,
// but we are aware of the importance of separating so we are currently assigning regions to be split when the time is right.

namespace NotT3ChatBackend {

    #region Program.cs
    public class Program {
        public static void Main(string[] args) {
            var builder = WebApplication.CreateBuilder(args);

            bool useGoogleAuth = builder.Configuration.GetValue<bool>("Authentication:UseGoogle", false);
            bool useIdentityAuth = builder.Configuration.GetValue<bool>("Authentication:UseIdentity", true);

            // Configure Serilog
            Log.Logger = new LoggerConfiguration()
                .WriteTo.Console()
                //.WriteTo.File("logs/app.log", rollingInterval: RollingInterval.Day)
                .CreateLogger();

            builder.Host.UseSerilog();

            builder.Services.AddDbContext<AppDbContext>(opt =>
                        // opt.UseInMemoryDatabase("DB"));
                        opt.UseSqlite(builder.Configuration.GetValue("ConnectionString", "Data Source=databse.dat")));

            builder.Services.AddMemoryCache();
            var auth = builder.Services.AddAuthentication();
            if (useGoogleAuth) {
                auth = auth.AddGoogle(options => {
                    options.ClientId = builder.Configuration["Authentication:Google:ClientId"]!;
                    options.ClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]!;
                    options.SignInScheme = IdentityConstants.ExternalScheme;
                });
            }
            

            builder.Services.AddAuthorization();
            builder.Services.AddEndpointsApiExplorer();

            // Add CORS services
            builder.Services.AddCors(options => {
                // This is OSS project, feel free to update this for your own use-cases
                options.AddPolicy("OpenCorsPolicy", policy => {
                    policy.SetIsOriginAllowed(_ => true)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                });
            });
            builder.Services.AddIdentityApiEndpoints<NotT3User>()
                        .AddRoles<IdentityRole>()
                        .AddEntityFrameworkStores<AppDbContext>()
                        .AddDefaultTokenProviders();

            builder.Services.ConfigureApplicationCookie(options => {
                options.Cookie.SameSite = SameSiteMode.None;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.HttpOnly = true;
                options.SlidingExpiration = true;
                options.ExpireTimeSpan = TimeSpan.FromDays(14);
            });
            builder.Services.ConfigureExternalCookie(options => {
                options.Cookie.SameSite = SameSiteMode.None;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.HttpOnly = true;
                options.ExpireTimeSpan = TimeSpan.FromMinutes(5);
            });

            builder.Services.Configure<IdentityOptions>(options => {
                // This is OSS project, feel free to update this for your own use-cases
                options.SignIn.RequireConfirmedEmail = false;
                options.User.RequireUniqueEmail = true;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequireDigit = false;
                options.Password.RequiredLength = 5;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
            });

            builder.Services.AddSignalR();
            builder.Services.AddHttpClient();
            builder.Services.AddSingleton<TornadoService>();
            builder.Services.AddSingleton<ExaApiService>();
            builder.Services.AddScoped<StreamingService>();

            var app = builder.Build();

            // Initialize database and create admin user
            using (var scope = app.Services.CreateScope()) {
                var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var userManager = scope.ServiceProvider.GetRequiredService<UserManager<NotT3User>>();

                context.Database.EnsureCreated();

#if DEBUG
                Log.Information("Creating debug admin user");
                var adminUser = new NotT3User { UserName = "admin@example.com", Email = "admin@example.com" };
                var result = userManager.CreateAsync(adminUser, "admin").Result;
                if (result.Succeeded)
                    Log.Information("Admin user created successfully");
                else
                    Log.Warning("Failed to create admin user: {Errors}", string.Join(", ", result.Errors.Select(e => e.Description)));
#endif
            }

            Log.Information("Configuring HTTP pipeline");
            app.UseForwardedHeaders(new ForwardedHeadersOptions {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });
            app.UseRouting();
            app.UseCors("OpenCorsPolicy");

            // Configure the HTTP request pipeline.
            app.UseAuthentication();
            app.UseAuthorization();

            Log.Information("Mapping endpoints");

            app.MapGet("/health", () => TypedResults.Ok());

            if (useIdentityAuth)
                app.MapIdentityApi<NotT3User>();
            if (useGoogleAuth)
                app.MapGoogleAuthEndpoints(useIdentityAuth);
            
            app.MapPost("/logout", async (SignInManager<NotT3User> signInManager) => {
                await signInManager.SignOutAsync();
                return TypedResults.Ok();
            }).RequireAuthorization();
            app.MapModelEndpoints();
            app.MapChatEndpoints();

            app.Run();
        }
    }
}
#endregion

namespace NotT3ChatBackend.Endpoints {
    #region Endpoints/GoogleLoginEndpoints.cs
    public static class GoogleAuthEndpoints {
        public static void MapGoogleAuthEndpoints(this IEndpointRouteBuilder app, bool isIdentitySupported) {
            app.MapGet("/login/google", ExternalLogin);
            app.MapGet("/oauth/google-cb", ExternalLoginCallback);
            if (!isIdentitySupported)
                app.MapGet("/manage/info", GetManageInfo);
        }
        static async Task<Results<Ok<InfoResponse>, ValidationProblem, NotFound>> GetManageInfo(ClaimsPrincipal claimsPrincipal, UserManager<NotT3User> userManager) {
            if (await userManager.GetUserAsync(claimsPrincipal) is not { } user) {
                return TypedResults.NotFound();
            }
            
            return TypedResults.Ok(new InfoResponse() {
                Email = await userManager.GetEmailAsync(user) ?? throw new NotSupportedException("Users must have an email."),
                IsEmailConfirmed = await userManager.IsEmailConfirmedAsync(user),
            });
        }
        static ChallengeHttpResult ExternalLogin(HttpContext ctx, SignInManager<NotT3User> signInManager, IWebHostEnvironment env) {
            var props = signInManager.ConfigureExternalAuthenticationProperties(GoogleDefaults.AuthenticationScheme, "/oauth/google-cb");
            return TypedResults.Challenge(props, [GoogleDefaults.AuthenticationScheme]);
        }
        static async Task<Results<UnauthorizedHttpResult, ForbidHttpResult, BadRequest<IEnumerable<IdentityError>>, RedirectHttpResult>> ExternalLoginCallback(SignInManager<NotT3User> signInManager, UserManager<NotT3User> userManager, HttpContext ctx, IConfiguration configuration) {
            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null) return TypedResults.Unauthorized();

            var signIn = await signInManager.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: false);
            NotT3User? user = null;

            if (!signIn.Succeeded) {
                var email = info.Principal.FindFirstValue(ClaimTypes.Email);
                if (email is null) return TypedResults.Forbid();

                user = await userManager.FindByEmailAsync(email);
                if (user is null) {
                    user = new NotT3User { UserName = email, Email = email, EmailConfirmed = true };
                    var createRes = await userManager.CreateAsync(user);
                    if (!createRes.Succeeded) return TypedResults.BadRequest(createRes.Errors);
                }
                var addLogin = await userManager.AddLoginAsync(user, info);
                if (!addLogin.Succeeded) return TypedResults.BadRequest(addLogin.Errors);
            }

            // If we got here, either it existed or we created it
            user ??= await userManager.FindByEmailAsync(info.Principal.FindFirstValue(ClaimTypes.Email)!);

            await signInManager.SignInAsync(user!, isPersistent: false);
            await ctx.SignOutAsync(IdentityConstants.ExternalScheme); // clear external cookie
            return TypedResults.Redirect(configuration["FrontEndUrl"]!);
        }
    }
    #endregion

    #region Endpoints/ChatEndpoints.cs
    public class ChatEndpointsMarker;
    public static class ChatEndpoints {
        public static void MapChatEndpoints(this IEndpointRouteBuilder app) {
            app.MapHub<ChatHub>("/chat").RequireAuthorization();
            app.MapPost("/chats/new", NewChat).RequireAuthorization();
            app.MapPost("/chats/fork", ForkChat).RequireAuthorization();
            app.MapDelete("/chats/{conversationId}", DeleteChat).RequireAuthorization();
            app.MapGet("/chats", GetChats).RequireAuthorization();
        }

        public static async Task<NoContent> DeleteChat(string conversationId, AppDbContext dbContext, HttpContext context, UserManager<NotT3User> userManager, ILogger<ChatEndpointsMarker> logger, IHubContext<ChatHub> hubContext) {
            logger.LogInformation("Deleting conversation {ConversationId} for user", conversationId);
            try {
                var user = await userManager.GetUserAsync(context.User) ?? throw new UnauthorizedAccessException();
                var convo = await dbContext.GetConversationAsync(conversationId, user);
                dbContext.Conversations.Remove(convo);
                await dbContext.SaveChangesAsync();

                await hubContext.Clients.Group(user.Id).SendAsync("DeleteConversation", convo.Id);
                logger.LogInformation("Conversation {ConversationId} deleted successfully", conversationId);
                return TypedResults.NoContent();
            }
            catch (Exception ex) {
                logger.LogError(ex, "Error deleting conversation {ConversationId}", conversationId);
                throw;
            }
        }

        public static async Task<Ok<NotT3ConversationDTO>> ForkChat([FromBody] ForkChatRequestDTO request, AppDbContext dbContext, HttpContext context, UserManager<NotT3User> userManager, ILogger<ChatEndpointsMarker> logger, IHubContext<ChatHub> hubContext) {
            logger.LogInformation("Forking conversation {ConversationId} from message {MessageId} for user", request.ConversationId, request.MessageId);

            try {
                // Retrieve our conversation & messages
                var user = await userManager.GetUserAsync(context.User) ?? throw new UnauthorizedAccessException();
                var convo = await dbContext.GetConversationAsync(request.ConversationId, user);
                await dbContext.Entry(convo).Collection(c => c.Messages).LoadAsync();

                // Sort the messages by index, and find the message to fork from
                var messages = convo.Messages.OrderBy(m => m.Index).ToList();
                var forkIndex = messages.FindIndex(m => m.Id == request.MessageId);
                if (forkIndex == -1) {
                    logger.LogWarning("Message {MessageId} not found in conversation {ConversationId}", request.MessageId, request.ConversationId);
                    throw new KeyNotFoundException($"Message {request.MessageId} not found in conversation {request.ConversationId}"); 
                }

                // Create a new conversation with the forked messages
                logger.LogInformation("Forking conversation at index {ForkIndex} with {MessageCount} messages", forkIndex, messages.Count);
                var newConvo = await dbContext.CreateConversationAsync(user);
                // Copy the title from the original conversation - append (Fork), (Fork_2), ...
                newConvo.Title = convo.Title.Contains("(Branch")
                                        ? Regex.Replace(convo.Title, @"\(Branch(_\d+)?\)", m => $"(Branch_{(m.Groups[1].Success ? int.Parse(m.Groups[1].Value[1..]) + 1 : 2)})")
                                        : $"{convo.Title} (Branch)";

                // Fork the messages
                var forkedMessages = messages.Take(forkIndex + 1).Select(m => new NotT3Message() {
                    Index = m.Index,
                    Role = m.Role,
                    Content = m.Content,
                    Timestamp = m.Timestamp,
                    ChatModel = m.ChatModel,
                    FinishError = m.FinishError,
                    ConversationId = newConvo.Id,
                    UserId = user.Id,
                }).ToList();
                await dbContext.AddRangeAsync(forkedMessages);
                await dbContext.SaveChangesAsync();

                _ = hubContext.Clients.Group(user.Id).SendAsync("NewConversation", new NotT3ConversationDTO(newConvo));
                logger.LogInformation("New conversation created with ID: {ConversationId}", convo.Id);
                return TypedResults.Ok(new NotT3ConversationDTO(newConvo));
            }
            catch (Exception ex) {
                logger.LogError(ex, "Error creating new conversation");
                throw;
            }
        }

        public static async Task<Ok<List<NotT3ConversationDTO>>> GetChats(AppDbContext dbContext, HttpContext context, UserManager<NotT3User> userManager, ILogger<ChatEndpointsMarker> logger) {
            logger.LogInformation("Retrieving conversations for user");
            try {
                var user = await userManager.GetUserAsync(context.User) ?? throw new UnauthorizedAccessException();
                await dbContext.Entry(user).Collection(u => u.Conversations).LoadAsync();
                var conversations = user.Conversations.OrderByDescending(c => c.CreatedAt)
                                                      .Select(c => new NotT3ConversationDTO(c)).ToList();
                logger.LogInformation("Retrieved {Count} conversations for user", conversations.Count);
                return TypedResults.Ok(conversations);
            }
            catch (Exception ex) {
                logger.LogError(ex, "Error retrieving conversations");
                throw;
            }
        }
        
        public static async Task<Ok<NotT3ConversationDTO>> NewChat(AppDbContext dbContext, HttpContext context, UserManager<NotT3User> userManager, ILogger<ChatEndpointsMarker> logger, IHubContext<ChatHub> hubContext) {
            logger.LogInformation("Creating new conversation for user");
            try {
                var user = await userManager.GetUserAsync(context.User) ?? throw new UnauthorizedAccessException();
                var convo = await dbContext.CreateConversationAsync(user);

                _ = hubContext.Clients.Group(user.Id).SendAsync("NewConversation", new NotT3ConversationDTO(convo));
                logger.LogInformation("New conversation created with ID: {ConversationId}", convo.Id);
                return TypedResults.Ok(new NotT3ConversationDTO(convo));
            }
            catch (Exception ex) {
                logger.LogError(ex, "Error creating new conversation");
                throw;
            }
        }
    }
    #endregion

    #region Endpoints/ModelEndpoints.cs

    public class ModelEndpointsMarker;
    public static class ModelEndpoints {
        public static void MapModelEndpoints(this IEndpointRouteBuilder app) {
            app.MapGet("/models", GetAvailableModels);
        }

        public static Ok<ICollection<ChatModelDTO>> GetAvailableModels(TornadoService tornadoService, ILogger<ModelEndpointsMarker> logger) {
            var models = tornadoService.GetAvailableModels();
            logger.LogInformation("Retrieved {Count} available models", models.Count);
            return TypedResults.Ok(models);
        }
    }
    #endregion
}

namespace NotT3ChatBackend.Services {
    #region Services/ExaApiService.cs
    public class ExaApiService {
        private readonly string? _apiKey;
        private readonly HttpClient _httpClient;
        public ExaApiService(IConfiguration configuration, IHttpClientFactory httpClientFactory) {
            _apiKey = configuration["EXA_API_KEY"];
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.DefaultRequestHeaders.Add("x-api-key", _apiKey ?? "");
            _httpClient.BaseAddress = new Uri("https://api.exa.ai");
        }

        public bool IsEnabled => _apiKey is not null;

        public async Task<List<ResultItem>?> WebSearch(string query) {
            if (!IsEnabled) return null;

            try {
                var response = await _httpClient.PostAsJsonAsync("/search", new {
                    query,
                    userLocation = "IL",
                    numResults = 6,
                    type = "auto",
                    contents = new {
                        text = new {
                            maxCharacters = 1200
                        },
                        highlights = new {
                            highlightsPerUrl = 3,
                            numSentences = 2
                        }
                    }
                });

                var result = await response.Content.ReadFromJsonAsync<JsonNode>();
                return result?["results"]?.AsArray().Select(res => new ResultItem {
                    Url = res!["url"]!.GetValue<string>(), 
                    Text = res["text"]!.GetValue<string>(),
                    Highlights = res["highlights"].Deserialize<List<string>>()!,
                    PublishedDate = res["publishedDate"]?.GetValue<string>(),
                    Title = res["title"]!.GetValue<string>(),
                }).ToList();
            } catch {
                return null;
            }
        }

        public async Task<List<ResultItem>?> WebFetch(string[] urls) {
            if (!IsEnabled) return null;

            try {
                var response = await _httpClient.PostAsJsonAsync("/contents", new {
                    urls,
                    livecrawl = "preferred",
                    text = new { maxCharacters = 1800 },
                    highlights = new { highlightsPerUrl = 5, numSentences = 2 }
                });
    
                var result = await response.Content.ReadFromJsonAsync<JsonNode>();
                return result?["results"]?.AsArray().Select(res => new ResultItem {
                    Url = res!["url"]!.GetValue<string>(),
                    Text = res["text"]!.GetValue<string>(),
                    Highlights = res["highlights"].Deserialize<List<string>>()!,
                    PublishedDate = res["publishedDate"]?.GetValue<string>(),
                    Title = res["title"]!.GetValue<string>(),
                }).ToList();
            }
            catch {
                return null;
            }
        }

        public class ResultItem {
            public required string Url { get; set; }
            public required string Title { get; set; }
            public required List<string> Highlights { get; set; }
            public string? PublishedDate { get; set; }
            public required string Text { get; set; }
        }
    }
    #endregion

    #region Services/TorandoService.cs
    public class TornadoService {
        private readonly Dictionary<string, TornadoApi> _apiByModel = new();
        private readonly Dictionary<string, ChatModel> _models;
        private readonly string? _titleModel;
        private readonly ILogger<TornadoService> _logger;
        private readonly ExaApiService _exaApiService;
        private readonly List<Tool>? _tools;

        public TornadoService(ILogger<TornadoService> logger, ExaApiService exaApiService, IConfiguration configuration) {
            _logger = logger;
            _exaApiService = exaApiService;

            if (_exaApiService.IsEnabled) {
                _tools = [
                    new Tool(async ([Description("The search query to perform.")] string query) => {
                        var results = await _exaApiService.WebSearch(query);
                        return results ?? [];
                    }, "web_search", "Search the web and return compact, relevant results (no summaries)."),
                    new Tool(async ([Description("The urls to fetch.")] string[] urls) => {
                        var results = await _exaApiService.WebFetch(urls);
                        return results ?? [];
                    }, "web_fetch", "Fetch content for specific URLs with livecrawl; returns compact text + highlights.")
                ];
            }

            var providerAuthentications = new List<ProviderAuthentication>();
            var allModels = new Dictionary<string, ChatModel>();
            foreach (var (configKey, provider, vendorProvider) in new (string, LLmProviders, BaseVendorModelProvider)[] {
                ("GOOGLE_API_KEY", LLmProviders.Google, ChatModel.Google),
                ("OAI_API_KEY", LLmProviders.OpenAi, ChatModel.OpenAi),
                ("ANTHROPIC_API_KEY", LLmProviders.Anthropic, ChatModel.Anthropic),
                ("OPENROUTER_API_KEY", LLmProviders.OpenRouter, ChatModel.OpenRouter),
                // ("AZURE_OAI_API_KEY", LLmProviders.AzureOpenAi, ChatModel.OpenAi), // Figure out how this conflicts with OpenAi
                ("COHERE_API_KEY", LLmProviders.Cohere, ChatModel.Cohere),
                ("GROQ_API_KEY", LLmProviders.Groq, ChatModel.Groq),
                ("DEEPSEEK_API_KEY", LLmProviders.DeepSeek, ChatModel.DeepSeek),
                ("MISTRAL_API_KEY", LLmProviders.Mistral, ChatModel.Mistral),
                ("XAI_API_KEY", LLmProviders.XAi, ChatModel.XAi),
                ("PERPLEXITY_API_KEY", LLmProviders.Perplexity, ChatModel.Perplexity),
            }) {
                if (configuration[configKey] is string apiKey && !string.IsNullOrEmpty(apiKey)) {
                    providerAuthentications.Add(new ProviderAuthentication(provider, apiKey));
                    foreach (var m in vendorProvider.AllModels)
                        allModels.TryAdd(m.Name, new ChatModel(m));
                    logger.LogInformation("{Provider} API key configured", provider);
                }
            }

            // Add the default api for all the *regular* providers
            var api = new TornadoApi(providerAuthentications);
            foreach (string m in allModels.Keys)
                _apiByModel.TryAdd(m, api);

            // Also allow specifying a custom url provider - create a new api wrapper
            // for each one of them.
            foreach (var customProvider in configuration.GetSection("CustomProviders").Get<CustomProviderInfo[]>()!) {
                api = new TornadoApi(new Uri(customProvider.Url), customProvider.ApiKey, LLmProviders.Custom);
                foreach (string m in customProvider.Models) {
                    allModels.Add(m, new ChatModel(m, LLmProviders.Custom));
                    _apiByModel.Add(m, api);
                }
            }
                
            // Choose the title model - if it doesn't exist in the list of available models, then just don't
            _titleModel = configuration["NOTT3CHAT_TITLE_MODEL"] ?? "gemini-2.0-flash-lite-001";
            if (!allModels.ContainsKey(_titleModel)) {
                _titleModel = null;
                logger.LogWarning("Title model {TitleModel} not found in available models, skipping", _titleModel);
            }

            if (configuration["NOTT3CHAT_MODELS_FILTER"] is string modelsFilter && !string.IsNullOrWhiteSpace(modelsFilter)) {
                var modelsFilterArr = modelsFilter.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                allModels = allModels.Keys.Intersect(modelsFilterArr).ToDictionary(k => k, k => allModels[k]);
                logger.LogInformation("Found models filter {Filter}, removing the rest", modelsFilter);
            }

            //_api = new TornadoApi(providerAuthentications);
            _models = allModels;
            logger.LogInformation("TorandoService initialized with {ModelCount} models", _models.Count);
        }

        public ICollection<ChatModelDTO> GetAvailableModels() {
            return [.. _models.Values.Select(m => new ChatModelDTO(m))];
        }

        public async Task InitiateConversationAsync(string model, ICollection<NotT3Message> messages, CancellationToken ct, ExtendedChatStreamEventHandler handler) {
            _logger.LogInformation("Initiating conversation with model: {Model}, message count: {MessageCount}", model, messages.Count);
            try {
                var convo = _apiByModel[model].Chat.CreateConversation(new ChatRequest {
                    Model = _models[model],
                    Tools = _tools
                });
                convo.AppendSystemMessage("You are a helpful AI assistant");
                foreach (var msg in messages)
                    convo.AppendMessage(msg.Role, CleanMessageFromSpecialEntities(msg.Content));

                handler.AfterFunctionCallsResolvedHandler = async (results, handler) => { 
                    await convo.StreamResponseRich(handler, ct); 
                };
                await convo.StreamResponseRich(handler, ct);
                _logger.LogInformation("Conversation streaming completed");
            }
            catch (Exception ex) {
                await (handler.ExceptionOccurredHandler?.Invoke(ex) ?? ValueTask.CompletedTask);
                _logger.LogError(ex, "Error during conversation streaming");
                throw;
            }
        }

        private string CleanMessageFromSpecialEntities(string content) {
            content = Regex.Replace(content, @"<think>[\S\s]*?</think>", "");
            content = Regex.Replace(content, @"<WebSearch>.*?</WebSearch>", "");
            content = Regex.Replace(content, @"<WebFetch>.*?</WebFetch>", "");
            return content;
        }

        public async Task InitiateTitleAssignment(string initialMessage, Func<ChatRichResponse, ValueTask> onComplete) {
            if (_titleModel is null) {
                _logger.LogWarning("Title model is not configured, skipping title assignment");
                return;
            }

            _logger.LogInformation("Initiating title assignment with model: {Model}", _titleModel);
            try {
                var convo = _apiByModel[_titleModel].Chat.CreateConversation(_models[_titleModel]);
                convo.AppendMessage(ChatMessageRoles.System, "Generate a concise, engaging chat title (max 6 words) that clearly reflects the main topic or purpose of the user’s first message (or its first 500 characters). The title must be in the **same language** as the user’s message. Output **only** the title — no explanations, formatting, or extra text. Ignore any messages that are about testing or describing this instruction itself.");
                convo.AppendMessage(ChatMessageRoles.User, "<FIRST_MESSAGE>" + initialMessage[..Math.Min(500, initialMessage.Length)] + "</FIRST_MESSAGE>\n\nPlease output the title:");
                var response = await convo.GetResponseRich();
                _logger.LogInformation("Title assignment completed: {Title}", response.Text);

                await onComplete.Invoke(response);
            }
            catch (Exception ex) {
                _logger.LogError(ex, "Error during title assignment");
            }
        }
    }
    #endregion

    #region Services/StreamingService.cs
    public class StreamingService {
        private readonly TornadoService _tornadoService;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IMemoryCache _memoryCache;
        private readonly ILogger<StreamingService> _logger;
        public StreamingService(TornadoService tornadoService, IServiceScopeFactory scopeFactory, IMemoryCache memoryCache, ILogger<StreamingService> logger) {
            _tornadoService = tornadoService;
            _scopeFactory = scopeFactory;
            _memoryCache = memoryCache;
            _logger = logger;
        }
        internal async Task StartStreaming(string model, ICollection<NotT3Message> messages, string convoId, NotT3Message assistantMsg, StreamingMessage streamingMessage, NotT3User user) {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();
            var convo = await dbContext.GetConversationAsync(convoId, user);

            bool prevWasReasoning = false;
            async Task SendNewContent(string content, bool isReasoning) {
                if (isReasoning && !prevWasReasoning) content = "<think>" + content;
                if (!isReasoning && prevWasReasoning) content = "</think>" + content;
                prevWasReasoning = isReasoning;

                await streamingMessage.Semaphore.WaitAsync();
                try {
                    streamingMessage.SbMessage.Append(content);
                    await hubContext.Clients.Group(convoId).SendAsync("NewAssistantPart", convoId, content);
                }
                finally {
                    streamingMessage.Semaphore.Release();
                }
            }

            ExtendedChatStreamEventHandler? handler = null;
            handler = new ExtendedChatStreamEventHandler() {
                ReasoningTokenHandler = async (messagePart) => {
                    if (messagePart.Content is null) return;
                    string content = messagePart.Content;
                    await SendNewContent(content, true);
                },
                MessagePartHandler = async (messagePart) => {
                    if (string.IsNullOrEmpty(messagePart.Text)) return;
                    string messageText = messagePart.Text;
                    await SendNewContent(messageText, false);
                },
                FunctionCallHandler = async (fns) => {
                    foreach (var fn in fns) {
                        if (fn.Name == "web_search" && fn.Result is not null) {
                            var results = JsonSerializer.Deserialize<JsonNode>(JsonSerializer.Deserialize<string>(fn.Result.Content)!)!
                                                ["Result"].Deserialize<List<ExaApiService.ResultItem>>();
                            await SendNewContent($"<WebSearch>{JsonSerializer.Serialize(results.Select(res => res.Url).ToList())}</WebSearch>", false);
                        }
                    }
                    await ValueTask.CompletedTask;
                },
                ToolCallsHandler = ToolCallsHandler.ContinueConversation,
                OnFinished = async (data) => {
                    _logger.LogInformation("Assistant message completed for conversation: {ConversationId}", convoId);
                    await hubContext.Clients.Group(convoId).SendAsync("EndAssistantMessage", convoId, null);

                    assistantMsg.Content = streamingMessage.SbMessage.ToString();
                    dbContext.Messages.Add(assistantMsg);
                    convo.IsStreaming = false;
                    await dbContext.SaveChangesAsync();
                    _logger.LogInformation("Assistant message saved to database");

                    _memoryCache.Set(convoId, streamingMessage, TimeSpan.FromMinutes(1));
                },
                ExceptionOccurredHandler = async (ex) => {
                    _logger.LogError(ex, "Error during streaming for conversation: {ConversationId}", convoId);
                    await hubContext.Clients.Group(convoId).SendAsync("EndAssistantMessage", convoId, ex.Message);

                    assistantMsg.Content = streamingMessage.SbMessage.ToString();
                    assistantMsg.FinishError = ex.Message;
                    dbContext.Messages.Add(assistantMsg);
                    convo.IsStreaming = false;
                    await dbContext.SaveChangesAsync();
                    _memoryCache.Remove(convoId);
                }
            };

            await _tornadoService.InitiateConversationAsync(model, messages, streamingMessage.Ct.Token, handler);
        }

        internal async Task StreamTitle(string convoId, NotT3Message userMsg, NotT3User user) {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<ChatHub>>();
            var convo = await dbContext.GetConversationAsync(convoId, user);

            await _tornadoService.InitiateTitleAssignment(userMsg.Content, async response => {
                string title = response.Text[..Math.Min(40, response.Text.Length)]; // ~6 words
                convo.Title = title;
                await dbContext.SaveChangesAsync();
                await hubContext.Clients.Group(user.Id).SendAsync("ChatTitle", convo.Id, convo.Title);
            });
        }
    }
}
#endregion

#region Hubs/ChatHub.cs
namespace NotT3ChatBackend.Hubs {
    public class ChatHub : Hub {
        private readonly StreamingService _streamingService;
        private readonly AppDbContext _dbContext;
        private readonly UserManager<NotT3User> _userManager;
        private readonly IMemoryCache _memoryCache;
        private readonly ILogger<ChatHub> _logger;
        
        public ChatHub(AppDbContext dbContext, UserManager<NotT3User> userManager, IMemoryCache memoryCache, StreamingService streamingService, ILogger<ChatHub> logger) {
            _dbContext = dbContext;
            _userManager = userManager;
            _memoryCache = memoryCache;
            _streamingService = streamingService;
            _logger = logger;
        }

        public override async Task OnConnectedAsync() {
            var user = await _userManager.GetUserAsync(Context.User ?? throw new UnauthorizedAccessException());
            _logger.LogInformation("User {UserId} connected", user.Id);
            await Groups.AddToGroupAsync(Context.ConnectionId, user.Id);
            await base.OnConnectedAsync();
        }

        public async Task ChooseChat(string convoId) { 
            _logger.LogInformation("User connecting to conversation: {ConversationId}", convoId);

            // It must be an existing conversation - retrieve it and send the existing messages
            var user = await _userManager.GetUserAsync(Context.User ?? throw new UnauthorizedAccessException());
            var conversation = await _dbContext.GetConversationAsync(convoId, user!);
            await _dbContext.Entry(conversation).Collection(c => c.Messages).LoadAsync();

            // Leave previous chat group (if any)
            if (Context.Items.TryGetValue(Context.ConnectionId, out var prevConvoId)) { 
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, prevConvoId!.ToString()!);
                _logger.LogInformation("User {UserId} left chat {PreviousChatId}", user!.Id, prevConvoId!.ToString());
            }

            _logger.LogInformation("Sending conversation history with {MessageCount} messages", conversation.Messages.Count);
            // Send out the messages
            await Clients.Client(Context.ConnectionId).SendAsync("ConversationHistory", convoId, conversation.Messages.OrderBy(m => m.Index).Select(m => new NotT3MessageDTO(m)).ToList());

            async Task AddToGroup() {
                await Groups.AddToGroupAsync(Context.ConnectionId, convoId);
                Context.Items[Context.ConnectionId] = convoId;
            }

            // TODO: consider race condition?
            // Check if we're in the middle of a message
            if (conversation.IsStreaming) {
                _logger.LogInformation("Conversation is currently streaming, checking for existing message");
                if (_memoryCache.TryGetValue(convoId, out StreamingMessage? currentMsg)) {
                    await currentMsg!.Semaphore.WaitAsync();
                    try {
                        await Clients.Client(Context.ConnectionId).SendAsync("BeginAssistantMessage", convoId, new NotT3MessageDTO(currentMsg.Message));
                        await Clients.Client(Context.ConnectionId).SendAsync("NewAssistantPart", convoId, currentMsg.SbMessage.ToString());
                        await AddToGroup();
                        _logger.LogInformation("User joined streaming conversation");
                    }
                    finally {
                        currentMsg.Semaphore.Release();
                    }
                }
            }
            else {
                await AddToGroup();
                _logger.LogInformation("User joined conversation group");
            }

            await base.OnConnectedAsync();
        }
        public async Task StopGenerating() {
            if (!Context.Items.TryGetValue(Context.ConnectionId, out var convoIdObj)) {
                _logger.LogWarning("User attempted to stop a message without being in a conversation group");
                return;
            }

            string convoId = convoIdObj!.ToString()!;
            _logger.LogInformation("Stop generation received for conversation: {ConversationId}", convoId);

            var user = await _userManager.GetUserAsync(Context.User ?? throw new NotImplementedException());
            var convo = await _dbContext.GetConversationAsync(convoId, user!);
            if (!convo.IsStreaming) {
                _logger.LogWarning("Attempted to stop conversation which wasn't streaming, ignoring: {ConversationId}", convoId);
                return;
            }

            _logger.LogInformation("Conversation is currently streaming, checking for existing message");
            if (_memoryCache.TryGetValue(convoId, out StreamingMessage? currentMsg)) {
                await currentMsg!.Semaphore.WaitAsync();
                try {
                    currentMsg.Ct.Cancel();
                }
                finally {
                    currentMsg.Semaphore.Release();
                }                
            }
        }

        public async Task NewMessage(string model, string message) {
            if (!Context.Items.TryGetValue(Context.ConnectionId, out var convoIdObj)) {
                _logger.LogWarning("User attempted to send a message without being in a conversation group");
                return;
            }

            string convoId = convoIdObj!.ToString()!;
            _logger.LogInformation("New message received for conversation: {ConversationId}, model: {Model}", convoId, model);

            var user = await _userManager.GetUserAsync(Context.User ?? throw new NotImplementedException());
            var convo = await _dbContext.GetConversationAsync(convoId, user!);

            if (convo.IsStreaming) {
                _logger.LogWarning("Attempted to send message to streaming conversation: {ConversationId}", convoId);
                throw new BadHttpRequestException("Conversation is already streaming, can't create a new message");
            }

            // Load in the messages
            await _dbContext.Entry(convo).Collection(c => c.Messages).LoadAsync();
            convo.Messages.Sort((a, b) => a.Index.CompareTo(b.Index));
            _logger.LogInformation("Loaded {MessageCount} existing messages for conversation", convo.Messages.Count);

            // Add in the new one
            var userMsg = new NotT3Message() {
                Index = convo.Messages.Count,
                Role = ChatMessageRoles.User,
                Content = message,
                Timestamp = DateTime.UtcNow,
                ConversationId = convo.Id,
                UserId = user!.Id
            };
            _dbContext.Messages.Add(userMsg);
            _logger.LogInformation("Added user message to conversation: {ConversationId}", convoId);

            // First message? Get a title
            if (userMsg.Index == 0) {
                _logger.LogInformation("First message in conversation, generating title asynchronously");
                _ = _streamingService.StreamTitle(convoId, userMsg, user);
            }

            convo.IsStreaming = true;
            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Conversation marked as streaming and changes saved");

            // Send out the user & assistant messages
            await Clients.Group(convoId).SendAsync("UserMessage", convo.Id, new NotT3MessageDTO(userMsg));

            var assistantMsg = new NotT3Message() {
                Index = convo.Messages.Count,
                Role = ChatMessageRoles.Assistant,
                Content = "",
                Timestamp = DateTime.UtcNow,
                ConversationId = convo.Id,
                UserId = user!.Id,
                ChatModel = model
            };
            await GenerateAssistantMessage(model, convoId, convo, assistantMsg, user!);
        }

        public async Task RegenerateMessage(string model, string messageId) {
            if (!Context.Items.TryGetValue(Context.ConnectionId, out var convoIdObj)) {
                _logger.LogWarning("User attempted to regenerated a message without being in a conversation group");
                return;
            }

            string convoId = convoIdObj!.ToString()!;
            _logger.LogInformation("Gegenerated message received for conversation: {ConversationId}, model: {Model}, messageId: {MessageId}", convoId, model, messageId);

            var user = await _userManager.GetUserAsync(Context.User ?? throw new NotImplementedException());
            var convo = await _dbContext.GetConversationAsync(convoId, user!);

            if (convo.IsStreaming) {
                Log.Warning("Attempted to send message to streaming conversation: {ConversationId}", convoId);
                throw new BadHttpRequestException("Conversation is already streaming, can't create a new message");
            }

            // Load in the messages
            await _dbContext.Entry(convo).Collection(c => c.Messages).LoadAsync();
            convo.Messages.Sort((a, b) => a.Index.CompareTo(b.Index));
            _logger.LogInformation("Loaded {MessageCount} existing messages for conversation", convo.Messages.Count);

            // Regenerating means deleting all the messages up until then
            var idxOfMessage = convo.Messages.FindIndex(m => m.Id == messageId);
            if (idxOfMessage == -1) {
                _logger.LogWarning("Message {MessageId} not found in conversation {ConversationId}", messageId, convoId);
                throw new KeyNotFoundException($"Message {messageId} not found in conversation {convoId}");
            }
            var lastMessage = convo.Messages[idxOfMessage];
            if (lastMessage.Role != ChatMessageRoles.Assistant) {
                _logger.LogWarning("Attempted to regenerate a non-assistant message, ignoring: {MessageId} in conversation {ConversationId}", messageId, convoId);
                return; 
            }

            // Remove the old messages
            _logger.LogInformation("Regenerating message, removing {Count} messages from index {Index}", convo.Messages.Count - idxOfMessage, idxOfMessage);
            _dbContext.RemoveRange(convo.Messages.Skip(idxOfMessage));
            convo.Messages.RemoveRange(idxOfMessage, convo.Messages.Count - idxOfMessage);

            // Zero out the contents of the last message
            _logger.LogInformation("Zeroing out content of last message with ID: {MessageId}", lastMessage.Id);
            var assistantMsg = new NotT3Message() {
                Id = lastMessage.Id,
                Index = convo.Messages.Count,
                Role = ChatMessageRoles.Assistant,
                Content = "",
                Timestamp = DateTime.UtcNow,
                ConversationId = convo.Id,
                UserId = user!.Id,
                ChatModel = model
            };
            convo.IsStreaming = true;
            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Conversation marked as streaming and changes saved");
            await GenerateAssistantMessage(model, convoId, convo, assistantMsg, user!);
        }

        private async Task GenerateAssistantMessage(string model, string convoId, NotT3Conversation convo, NotT3Message assistantMsg, NotT3User user) {
            await Clients.Group(convoId).SendAsync("BeginAssistantMessage", convoId, new NotT3MessageDTO(assistantMsg));
            _logger.LogInformation("Starting assistant response with ID: {ResponseId}", assistantMsg.Id);

            var streamingMessage = new StreamingMessage(new StringBuilder(),assistantMsg, new SemaphoreSlim(1), new CancellationTokenSource());
            _memoryCache.Set(convoId, streamingMessage, TimeSpan.FromMinutes(5)); // Max expiration of 5 minutes

            // Create our conversation and sync
            _ = _streamingService.StartStreaming(model, convo.Messages, convoId, assistantMsg, streamingMessage, user);
        }
    }
}
#endregion

#region Data/AppDbContext.cs
namespace NotT3ChatBackend.Data {
    public class AppDbContext(DbContextOptions<AppDbContext> options, ILogger<AppDbContext> logger) : IdentityDbContext<NotT3User>(options) {
#pragma warning disable CS8618 // Non-nullable field must contain a non-null value when exiting constructor. Consider adding the 'required' modifier or declaring as nullable.
        internal DbSet<NotT3Conversation> Conversations { get; init; }
        internal DbSet<NotT3Message> Messages { get; init; }

        internal async Task<NotT3Conversation> CreateConversationAsync(NotT3User user) {
            logger.LogInformation("Creating new conversation for user: {UserId}", user.Id);
            var convo = new NotT3Conversation() {
                UserId = user.Id
            };
            await Conversations.AddAsync(convo);
            await SaveChangesAsync();
            logger.LogInformation("Conversation created with ID: {ConversationId}", convo.Id);
            return convo;
        }

        internal async Task<NotT3Conversation> GetConversationAsync(string convoId, NotT3User user) {
            logger.LogDebug("Retrieving conversation: {ConversationId} for user: {UserId}", convoId, user.Id);
            var convo = await Conversations.FindAsync(convoId);
            if (convo == null) {
                logger.LogWarning("Conversation not found: {ConversationId}", convoId);
                throw new KeyNotFoundException();
            }
            if (convo.UserId != user.Id) {
                logger.LogWarning("User {UserId} attempted to access conversation {ConversationId} owned by {OwnerId}", user.Id, convoId, convo.UserId);
                throw new UnauthorizedAccessException();
            }
            return convo;
        }
#pragma warning restore CS8618 // Non-nullable field must contain a non-null value when exiting constructor. Consider adding the 'required' modifier or declaring as nullable.
    }
}
#endregion

namespace NotT3ChatBackend.Models {
    #region Models/NotT3User.cs
    public class NotT3User : IdentityUser {
        // Navigators
        public ICollection<NotT3Conversation> Conversations { get; set; } = [];
    }
    #endregion

    #region Models/NotT3Conversation.cs
    public class NotT3Conversation {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public DateTime CreatedAt { get; } = DateTime.UtcNow;
        public string Title { get; set; } = "New Chat";
        public required string UserId { get; set; }
        public bool IsStreaming { get; set; } = false;

        // Navigators
        public NotT3User? User { get; set; }
        public List<NotT3Message> Messages { get; set; } = [];
    }
    #endregion

    #region Models/NotT3Message.cs
    public class NotT3Message {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public required int Index { get; set; }
        public required ChatMessageRoles Role { get; set; }
        public required string Content { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string? ChatModel { get; set; }
        public string? FinishError { get; set; }

        public required string ConversationId { get; set; }
        public required string UserId { get; set; }

        // Navigators
        public NotT3Conversation? Conversation { get; set; }
        public NotT3User? User { get; set; }
    }
    #endregion
}

namespace NotT3ChatBackend.DTOs {
    #region DTOs/NotT3ConversationDTO.cs
    public record NotT3ConversationDTO(string Id, DateTime CreatedAt, string Title) {
        public NotT3ConversationDTO(NotT3Conversation conversation) : this(conversation.Id, conversation.CreatedAt, conversation.Title) { }
    }
    #endregion

    #region DTOs/NotT3MessageDTO.cs
    public record NotT3MessageDTO(string Id, int Index, string Role, string Content, DateTime Timestamp, string? ChatModel, string? FinishError) {
        public NotT3MessageDTO(NotT3Message message) : this(message.Id, message.Index, message.Role.ToString().ToLower(), message.Content, message.Timestamp, message.ChatModel, message.FinishError) { }
    }
    #endregion

    #region DTOs/ForkChatRequestDTO.cs
    public record ForkChatRequestDTO(string ConversationId, string MessageId);
    #endregion

    #region DTOs/ChatModelDTO.cs
    public record ChatModelDTO(string Name, string Provider) {
        public ChatModelDTO(ChatModel model) : this(model.Name, model.Provider.ToString()) {
            // This is a simple DTO, so we don't need to do anything else
        }
    }
    #endregion
}

namespace NotT3ChatBackend.Utils {
    #region Utils/ExtendedChatStreamEventHandler.cs
    public class ExtendedChatStreamEventHandler : ChatStreamEventHandler {
        public Func<Exception, ValueTask>? ExceptionOccurredHandler { get; set; }
    }
    #endregion

    #region Utils/StreamingMessage.cs
    public record StreamingMessage(StringBuilder SbMessage, NotT3Message Message, SemaphoreSlim Semaphore, CancellationTokenSource Ct);
    #endregion

    #region Utils/CustomProviderInfo.cs
    public record CustomProviderInfo(string Url, string ApiKey, string[] Models);
    #endregion
}